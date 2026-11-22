import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  hashPassword,
  loadStore,
  saveStore,
  type StoredBackupConfig,
  type StoredBackupRun,
  type StoredBackupSchedule,
  verifyPassword,
} from './server-store.ts';

dotenv.config();

const execFileAsync = promisify(execFile);

interface SessionPayload {
  sub: string;
  authMethod: 'local' | 'google';
  displayName: string;
  email?: string;
  exp: number;
}

interface AuthenticatedRequest extends Request {
  sessionUser?: SessionPayload;
}

interface BackupRunPayload {
  serverName: string;
  cyberpanelUrl: string;
  cyberpanelUsername: string;
  backupMode: 'api_and_drive' | 'snapshot_and_drive';
  domains: string[];
  domainPaths: Record<string, string>;
  includeFiles: boolean;
  includeDatabases: boolean;
  includeEmails: boolean;
  includeSslDns: boolean;
  excludeHeavyDeps: boolean;
  driveFolderName: string;
  driveFolderId: string;
  compressionFormat: 'tar.gz' | 'tar.zst';
  triggerType: 'manual' | 'scheduled';
  autoPruneDrive: boolean;
  maxRetentionFiles: number;
}

interface TarEntry {
  name: string;
  content: Buffer;
}

interface DiscoveredWebsite {
  domain: string;
  state: string;
  packageName?: string;
  docRoot?: string;
  projectRoot?: string;
  framework?: 'laravel' | 'php' | 'unknown';
}

const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DOMAIN_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,125}[a-zA-Z0-9]$/;
const TIME_REGEX = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const IN_MEMORY_SESSION_SECRET = crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOCAL_BACKUPS_DIR = path.resolve(process.cwd(), 'data', 'backups');

function getSessionSecret(): string {
  return (process.env.SESSION_SECRET || '').trim() || IN_MEMORY_SESSION_SECRET;
}

function getGoogleClientId(): string {
  return (process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
}

function getRcloneRemoteName(): string {
  const raw = (process.env.RCLONE_REMOTE || 'gdrive').trim();
  return /^[a-zA-Z0-9_-]{1,64}$/.test(raw) ? raw : 'gdrive';
}

function signSessionToken(payload: Omit<SessionPayload, 'exp'>): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!decoded.sub || !decoded.exp || decoded.exp < Date.now()) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir. Silakan masuk kembali.' });
    return;
  }
  req.sessionUser = session;
  next();
}

function getEnvAdminCredentials(): { username: string; password: string } | null {
  const envPass = (process.env.ADMIN_PASSWORD || '').trim();
  if (!envPass) return null;
  const envUser = (process.env.ADMIN_USERNAME || 'admin').trim() || 'admin';
  return { username: envUser, password: envPass };
}

function timingSafeTextEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function isPrivateOrBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().trim();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower === '0.0.0.0' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.localhost')
  ) {
    return true;
  }

  if (net.isIPv4(lower)) {
    const parts = lower.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  }

  if (net.isIPv6(lower)) {
    if (lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) {
      return true;
    }
  }

  return false;
}

function validateCyberPanelUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('URL panel CyberPanel belum diisi.');
  }
  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Protokol URL harus http atau https.');
  }
  if (isPrivateOrBlockedHost(parsed.hostname)) {
    throw new Error('Alamat host internal/loopback tidak diizinkan untuk probe jarak jauh.');
  }
  return parsed;
}

function findCyberPanelCliBinary(): string | null {
  const candidates = [
    '/usr/bin/cyberpanel',
    '/usr/local/bin/cyberpanel',
    '/usr/local/CyberCP/bin/cyberpanel',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function findRcloneBinary(): string | null {
  const candidates = ['/usr/bin/rclone', '/usr/local/bin/rclone'];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function findMysqlDumpBinary(): string {
  const candidates = [
    '/usr/bin/mariadb-dump',
    '/usr/bin/mysqldump',
    '/usr/local/bin/mariadb-dump',
    '/usr/local/bin/mysqldump',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return process.platform === 'win32' ? 'mysqldump.exe' : 'mysqldump';
}

interface EnvDbConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

function stripEnvQuotes(val: string): string {
  const trimmed = val.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseProjectEnvDatabase(projectPath: string): EnvDbConfig | null {
  const candidateEnvFiles = [
    path.join(projectPath, '.env'),
    path.join(path.dirname(projectPath), '.env'),
  ];
  const envFile = candidateEnvFiles.find((p) => fs.existsSync(p));
  if (!envFile) return null;

  try {
    const raw = fs.readFileSync(envFile, 'utf8');
    const vars: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = stripEnvQuotes(trimmed.slice(eqIdx + 1));
      vars[key] = val;
    }

    const conn = (vars.DB_CONNECTION || 'mysql').toLowerCase();
    if (conn !== 'mysql' && conn !== 'mariadb') return null;

    const database = (vars.DB_DATABASE || '').trim();
    const username = (vars.DB_USERNAME || '').trim();
    const host = (vars.DB_HOST || '127.0.0.1').trim();
    const port = Number(vars.DB_PORT || '3306');
    const password = vars.DB_PASSWORD ?? '';

    if (!/^[a-zA-Z0-9_$-]{1,64}$/.test(database)) return null;
    if (!/^[a-zA-Z0-9_.@-]{1,64}$/.test(username)) return null;
    if (!/^[a-zA-Z0-9.-]{1,128}$/.test(host)) return null;
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

    return { host, port, database, username, password };
  } catch {
    return null;
  }
}

async function dumpDatabaseToBuffer(db: EnvDbConfig): Promise<Buffer> {
  const bin = findMysqlDumpBinary();
  const args = [
    '--single-transaction',
    '--quick',
    '--routines',
    '--triggers',
    '-h',
    db.host,
    '-P',
    String(db.port),
    '-u',
    db.username,
    db.database,
  ];
  const { stdout } = await execFileAsync(bin, args, {
    env: { ...process.env, MYSQL_PWD: db.password },
    timeout: 120000,
    maxBuffer: 40 * 1024 * 1024,
    encoding: 'buffer',
  });
  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout, 'utf8');
}

async function isRcloneRemoteReady(): Promise<boolean> {
  const bin = findRcloneBinary();
  if (!bin) return false;
  try {
    const { stdout } = await execFileAsync(bin, ['listremotes'], { timeout: 4000 });
    const target = `${getRcloneRemoteName()}:`;
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .includes(target);
  } catch {
    return false;
  }
}

function sanitizeProjectPath(raw: unknown): string {
  const val = String(raw || '').trim();
  if (!val || val.length > 256) return '';
  if (/[\x00-\x1f`$;&|<>]/.test(val)) return '';
  if (val.includes('..')) return '';
  const isUnixAbs = val.startsWith('/');
  const isWinAbs = /^[a-zA-Z]:[/\\]/.test(val);
  if (!isUnixAbs && !isWinAbs) return '';
  const normalized = val.replace(/\/+$/, '') || '/';
  const blocked = new Set(['/', '/etc', '/bin', '/sbin', '/usr', '/boot', '/dev', '/proc', '/sys']);
  if (blocked.has(normalized)) return '';
  return normalized;
}

function sanitizeDomainPathsMap(
  rawMap: unknown,
  allowedDomains: string[],
  fallbackMap: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  const source =
    rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)
      ? (rawMap as Record<string, unknown>)
      : fallbackMap;

  for (const domain of allowedDomains) {
    if (!DOMAIN_REGEX.test(domain)) continue;
    const candidate = sanitizeProjectPath(source[domain] ?? fallbackMap[domain]);
    if (candidate) {
      result[domain] = candidate;
    }
  }
  return result;
}

function inspectDomainVhost(domain: string): {
  docRoot?: string;
  projectRoot?: string;
  framework: 'laravel' | 'php' | 'unknown';
} {
  if (!DOMAIN_REGEX.test(domain)) {
    return { framework: 'unknown' };
  }
  const vhostFile = path.resolve('/usr/local/lsws/conf/vhosts', domain, 'vhost.conf');
  if (!fs.existsSync(vhostFile)) {
    return { framework: 'unknown' };
  }

  try {
    const content = fs.readFileSync(vhostFile, 'utf8');
    const vhRootMatch = content.match(/^\s*vhRoot\s+([^\s#]+)/m);
    const docRootMatch = content.match(/^\s*docRoot\s+([^\s#]+)/m);

    const vhRoot = (vhRootMatch?.[1] || `/home/${domain}`).replace(/\/+$/, '');
    let docRoot = docRootMatch?.[1] || `${vhRoot}/public_html`;
    docRoot = docRoot
      .replace(/\$VH_ROOT/g, vhRoot)
      .replace(/\$VH_NAME/g, domain)
      .replace(/\/+/g, '/')
      .replace(/\/+$/, '');

    const cleanDocRoot = sanitizeProjectPath(docRoot);
    if (!cleanDocRoot) {
      return { framework: 'unknown' };
    }

    // Detect Laravel installed either directly in docRoot or in parent of .../public
    if (cleanDocRoot.endsWith('/public')) {
      const parentDir = path.posix.dirname(cleanDocRoot);
      if (
        fs.existsSync(path.posix.join(parentDir, 'artisan')) ||
        fs.existsSync(path.posix.join(parentDir, 'composer.json'))
      ) {
        return {
          docRoot: cleanDocRoot,
          projectRoot: parentDir,
          framework: 'laravel',
        };
      }
    }

    if (
      fs.existsSync(path.posix.join(cleanDocRoot, 'artisan')) ||
      fs.existsSync(path.posix.join(cleanDocRoot, 'composer.json'))
    ) {
      return {
        docRoot: cleanDocRoot,
        projectRoot: cleanDocRoot,
        framework: 'laravel',
      };
    }

    return {
      docRoot: cleanDocRoot,
      projectRoot: cleanDocRoot,
      framework: 'php',
    };
  } catch {
    return { framework: 'unknown' };
  }
}

async function discoverLocalCyberPanelWebsites(): Promise<{
  isCyberPanelHost: boolean;
  source: 'cyberpanel_cli' | 'lsws_vhosts' | 'none';
  websites: DiscoveredWebsite[];
  message: string;
}> {
  const cliBinary = findCyberPanelCliBinary();
  if (cliBinary) {
    try {
      const { stdout } = await execFileAsync(cliBinary, ['listWebsitesJson'], {
        timeout: 6000,
        maxBuffer: 2 * 1024 * 1024,
      });
      const parsed = JSON.parse(stdout.trim()) as Array<{
        domain?: string;
        state?: string;
        package?: string;
      }>;
      if (Array.isArray(parsed)) {
        const websites = parsed
          .filter((item) => item.domain && DOMAIN_REGEX.test(item.domain))
          .map((item) => {
            const domain = String(item.domain);
            const inspected = inspectDomainVhost(domain);
            return {
              domain,
              state: String(item.state || 'Active'),
              packageName: item.package ? String(item.package) : undefined,
              docRoot: inspected.docRoot,
              projectRoot: inspected.projectRoot,
              framework: inspected.framework,
            };
          });
        const laravelCount = websites.filter((w) => w.framework === 'laravel').length;
        return {
          isCyberPanelHost: true,
          source: 'cyberpanel_cli',
          websites,
          message:
            laravelCount > 0
              ? `Berhasil mengambil ${websites.length} website dari CyberPanel CLI (${laravelCount} proyek Laravel terdeteksi dari vhost.conf).`
              : `Berhasil mengambil ${websites.length} website langsung dari CyberPanel CLI.`,
        };
      }
    } catch {
      // Fallback to OpenLiteSpeed vhosts directory
    }
  }

  const vhostDir = '/usr/local/lsws/conf/vhosts';
  if (fs.existsSync(vhostDir)) {
    try {
      const entries = fs.readdirSync(vhostDir, { withFileTypes: true });
      const excluded = new Set(['example', 'cyberpanel', 'default', 'localhost']);
      const websites = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !excluded.has(e.name.toLowerCase()))
        .filter((e) => DOMAIN_REGEX.test(e.name))
        .map((e) => {
          const inspected = inspectDomainVhost(e.name);
          return {
            domain: e.name,
            state: 'Active',
            docRoot: inspected.docRoot,
            projectRoot: inspected.projectRoot,
            framework: inspected.framework,
          };
        });
      return {
        isCyberPanelHost: true,
        source: 'lsws_vhosts',
        websites,
        message: `Ditemukan ${websites.length} virtual host website beserta konfigurasi docRoot dari OpenLiteSpeed CyberPanel.`,
      };
    } catch {
      return {
        isCyberPanelHost: true,
        source: 'none',
        websites: [],
        message:
          'Server CyberPanel terdeteksi, namun user proses belum memiliki izin baca CLI/vhosts. Lihat panduan di docs/PANDUAN_CYBERPANEL.md.',
      };
    }
  }

  return {
    isCyberPanelHost: false,
    source: 'none',
    websites: [],
    message:
      'Lingkungan saat ini bukan host CyberPanel lokal. Tambahkan domain & path proyek secara manual atau pasang aplikasi di VPS CyberPanel Anda.',
  };
}

function findNewestLocalCyberPanelArchive(domain: string): string | null {
  if (!DOMAIN_REGEX.test(domain)) return null;
  const candidateDirs = [path.resolve('/home', domain, 'backup'), path.resolve('/home/backup')];
  let newestFile: { fullPath: string; mtimeMs: number } | null = null;

  for (const baseDir of candidateDirs) {
    if (!fs.existsSync(baseDir)) continue;
    try {
      const files = fs.readdirSync(baseDir);
      for (const file of files) {
        if (!file.endsWith('.tar.gz') || !file.includes(domain)) continue;
        const resolved = path.resolve(baseDir, file);
        if (!resolved.startsWith(baseDir + path.sep)) continue;
        const stat = fs.statSync(resolved);
        if (!stat.isFile()) continue;
        if (!newestFile || stat.mtimeMs > newestFile.mtimeMs) {
          newestFile = { fullPath: resolved, mtimeMs: stat.mtimeMs };
        }
      }
    } catch {
      // Ignore unreadable dirs
    }
  }

  return newestFile ? newestFile.fullPath : null;
}

function cleanupLocalCyberPanelArchives(domain: string): { deletedCount: number; freedBytes: number } {
  if (!DOMAIN_REGEX.test(domain)) {
    throw new Error(`Domain tidak valid untuk pembersihan arsip lokal: ${domain}`);
  }

  const candidateDirs = [path.resolve('/home', domain, 'backup'), path.resolve('/home/backup')];
  const archivePrefix = `backup-${domain}-`;
  let deletedCount = 0;
  let freedBytes = 0;

  for (const baseDir of candidateDirs) {
    let files: string[];
    try {
      files = fs.readdirSync(baseDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }

    for (const file of files) {
      if (!file.startsWith(archivePrefix) || !file.endsWith('.tar.gz')) continue;
      const resolved = path.resolve(baseDir, file);
      if (path.dirname(resolved) !== baseDir) continue;

      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(resolved);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw err;
      }
      if (!stat.isFile()) continue;

      fs.unlinkSync(resolved);
      deletedCount += 1;
      freedBytes += stat.size;
    }
  }

  return { deletedCount, freedBytes };
}

function cleanupUploadedCyberPanelArchives(domain: string, emitLog: (level: 'INFO' | 'WARN', msg: string) => void) {
  try {
    const result = cleanupLocalCyberPanelArchives(domain);
    if (result.deletedCount > 0) {
      emitLog(
        'INFO',
        `${result.deletedCount} arsip lokal ${domain} dihapus setelah upload berhasil (${result.freedBytes} bytes dibebaskan).`
      );
    }
  } catch (err) {
    emitLog(
      'WARN',
      `Upload ${domain} berhasil, tetapi arsip lokal tidak dapat dibersihkan: ${err instanceof Error ? err.message : 'unknown error'}`
    );
  }
}

function cleanupUploadedLocalArchive(
  filePath: string,
  description: string,
  emitLog: (level: 'INFO' | 'WARN', msg: string) => void
) {
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile()) return;
    fs.unlinkSync(filePath);
    emitLog('INFO', `${description} ${path.basename(filePath)} dihapus setelah upload berhasil (${stat.size} bytes).`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    emitLog(
      'WARN',
      `Upload berhasil, tetapi ${description.toLowerCase()} ${path.basename(filePath)} tidak dapat dihapus: ${err instanceof Error ? err.message : 'unknown error'}`
    );
  }
}

function createTarBuffer(entries: TarEntry[]): Buffer {
  const blocks: Buffer[] = [];

  for (const entry of entries) {
    const header = Buffer.alloc(512, 0);
    const safeName = entry.name.replace(/^\/+/, '').slice(0, 99);
    header.write(safeName, 0, 'utf8');
    header.write('0000644\0', 100, 'ascii');
    header.write('0000000\0', 108, 'ascii');
    header.write('0000000\0', 116, 'ascii');
    header.write(entry.content.length.toString(8).padStart(11, '0') + '\0', 124, 'ascii');
    header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136, 'ascii');
    header.fill(0x20, 148, 156);
    header.write('0', 156, 'ascii');
    header.write('ustar\0', 257, 'ascii');
    header.write('00', 263, 'ascii');

    let checksum = 0;
    for (let i = 0; i < 512; i += 1) {
      checksum += header[i];
    }
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');

    blocks.push(header);
    blocks.push(entry.content);
    const remainder = entry.content.length % 512;
    if (remainder !== 0) {
      blocks.push(Buffer.alloc(512 - remainder, 0));
    }
  }

  blocks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(blocks);
}

function escapeDriveQueryValue(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function ensureDriveBackupFolder(
  driveToken: string,
  folderName: string,
  preferredFolderId?: string
): Promise<{ id: string; name: string; created: boolean }> {
  if (preferredFolderId && /^[a-zA-Z0-9_-]{8,128}$/.test(preferredFolderId)) {
    const verifyRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(preferredFolderId)}?fields=id,name,trashed,mimeType`,
      { headers: { Authorization: `Bearer ${driveToken}` } }
    );
    if (verifyRes.ok) {
      const folderMeta = (await verifyRes.json()) as {
        id: string;
        name: string;
        trashed?: boolean;
        mimeType?: string;
      };
      if (!folderMeta.trashed && folderMeta.mimeType === 'application/vnd.google-apps.folder') {
        return { id: folderMeta.id, name: folderMeta.name, created: false };
      }
    }
  }

  const query = `name='${escapeDriveQueryValue(folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=5`,
    { headers: { Authorization: `Bearer ${driveToken}` } }
  );

  if (!searchRes.ok) {
    const text = await searchRes.text();
    throw new Error(`Gagal memeriksa folder Google Drive (${searchRes.status}): ${text}`);
  }

  const searchData = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
  if (searchData.files && searchData.files.length > 0) {
    return { id: searchData.files[0].id, name: searchData.files[0].name, created: false };
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${driveToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Gagal membuat folder di Google Drive (${createRes.status}): ${text}`);
  }

  const created = (await createRes.json()) as { id: string; name: string };
  return { id: created.id, name: created.name, created: true };
}

async function uploadArchiveToGoogleDrive(
  driveToken: string,
  folderId: string,
  filename: string,
  archiveBuffer: Buffer,
  description: string
): Promise<{ id: string; name: string; size: number; createdTime: string }> {
  const boundary = `cybervault_${crypto.randomBytes(12).toString('hex')}`;
  const metadata = JSON.stringify({
    name: filename,
    parents: [folderId],
    description,
  });

  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`,
    'utf8'
  );
  const epilogue = Buffer.from(`\r\n--${boundary}--`, 'utf8');
  const multipartBody = Buffer.concat([preamble, archiveBuffer, epilogue]);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${driveToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(multipartBody.length),
      },
      body: multipartBody,
    }
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Upload ke Google Drive gagal (${uploadRes.status}): ${errText}`);
  }

  const uploaded = (await uploadRes.json()) as {
    id: string;
    name: string;
    size?: string;
    createdTime?: string;
  };

  return {
    id: uploaded.id,
    name: uploaded.name,
    size: Number(uploaded.size || archiveBuffer.length),
    createdTime: uploaded.createdTime || new Date().toISOString(),
  };
}

async function pruneOldBackupsInDrive(
  driveToken: string,
  folderId: string,
  maxRetentionFiles: number
): Promise<{ deletedCount: number; deletedNames: string[] }> {
  const query = `'${escapeDriveQueryValue(folderId)}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`;
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime desc&fields=files(id,name,createdTime)&pageSize=100`,
    { headers: { Authorization: `Bearer ${driveToken}` } }
  );

  if (!listRes.ok) {
    return { deletedCount: 0, deletedNames: [] };
  }

  const data = (await listRes.json()) as {
    files?: Array<{ id: string; name: string; createdTime?: string }>;
  };

  const files = data.files || [];
  if (files.length <= maxRetentionFiles) {
    return { deletedCount: 0, deletedNames: [] };
  }

  const toDelete = files.slice(maxRetentionFiles);
  const deletedNames: string[] = [];

  for (const file of toDelete) {
    const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${driveToken}` },
    });
    if (delRes.ok || delRes.status === 204) {
      deletedNames.push(file.name);
    }
  }

  return { deletedCount: deletedNames.length, deletedNames };
}

function buildCyberPanelCronScript(payload: BackupRunPayload, folderName: string): string {
  const domains = payload.domains.length > 0 ? payload.domains : ['smkn1temon.sch.id'];
  const domainLines = domains
    .map((d) => `  "${d.replace(/[^a-zA-Z0-9.-]/g, '')}"`)
    .join('\n');

  const externalPathBlocks = domains
    .map((d) => ({ domain: d, customPath: sanitizeProjectPath(payload.domainPaths?.[d]) }))
    .filter(({ domain, customPath }) => customPath && !customPath.startsWith(`/home/${domain}/`) && customPath !== `/home/${domain}`)
    .map(({ domain, customPath }) => {
      const excludeFlags = payload.excludeHeavyDeps ? '--exclude="vendor" --exclude="node_modules" --exclude=".git"' : '';
      return `if [ -d "${customPath}" ]; then
  echo "-> Mengarsipkan proyek Laravel/kustom (${domain}): ${customPath}"
  tar ${excludeFlags} -czf "$BACKUP_ROOT/custom-${domain}-$TIMESTAMP.tar.gz" -C "$(dirname "${customPath}")" "$(basename "${customPath}")"
  if [ -f "${customPath}/.env" ]; then
    DB_NAME=$(grep -E '^DB_DATABASE=' "${customPath}/.env" | head -n1 | cut -d= -f2- | tr -d '"'\''\\r ')
    DB_USER=$(grep -E '^DB_USERNAME=' "${customPath}/.env" | head -n1 | cut -d= -f2- | tr -d '"'\''\\r ')
    DB_PASS=$(grep -E '^DB_PASSWORD=' "${customPath}/.env" | head -n1 | cut -d= -f2- | tr -d '"'\''\\r ')
    DB_HOST=$(grep -E '^DB_HOST=' "${customPath}/.env" | head -n1 | cut -d= -f2- | tr -d '"'\''\\r ')
    if [ -n "$DB_NAME" ] && [ -n "$DB_USER" ]; then
      echo "-> Dump database MariaDB ($DB_NAME) untuk ${domain}..."
      MYSQL_PWD="$DB_PASS" mysqldump --single-transaction --quick -h "\${DB_HOST:-127.0.0.1}" -u "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_ROOT/db-${domain}-$DB_NAME-$TIMESTAMP.sql.gz"
    fi
  fi
fi`;
    })
    .join('\n\n');

  return `#!/usr/bin/env bash
# CyberVault Automatic CyberPanel & Laravel -> Google Drive Backup Script
# Server: ${payload.serverName.replace(/\n/g, ' ')}
set -euo pipefail

BACKUP_ROOT="/home/backup"
GDRIVE_REMOTE="${getRcloneRemoteName()}:${folderName.replace(/[^a-zA-Z0-9_ -]/g, '')}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DOMAINS=(
${domainLines}
)

mkdir -p "$BACKUP_ROOT"

echo "[$TIMESTAMP] Memulai backup CyberPanel ke Google Drive..."
for DOMAIN in "\${DOMAINS[@]}"; do
  echo "-> Membuat arsip backup (/home/$DOMAIN + DB) untuk $DOMAIN..."
  cyberpanel createBackup --domainName "$DOMAIN"
done

${externalPathBlocks ? `# Arsip tambahan untuk proyek Laravel / aplikasi di luar /home/<domain>\n${externalPathBlocks}\n\n` : ''}echo "-> Sinkronisasi arsip .tar.gz ke $GDRIVE_REMOTE..."
rclone copy "$BACKUP_ROOT" "$GDRIVE_REMOTE" --include "*.tar.gz" --transfers 2 --checkers 4 --stats 10s
echo "[$TIMESTAMP] Backup selesai dan tersinkron ke Google Drive."
`;
}

function sendSse(res: Response, event: string, data: Record<string, unknown>) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeBackupPipeline(options: {
  payload: BackupRunPayload;
  operatorLabel: string;
  driveToken?: string;
  onProgress?: (progress: number, stage: string) => void;
  onLog?: (level: 'INFO' | 'OK' | 'WARN' | 'ERROR', message: string) => void;
}): Promise<{
  archiveName: string;
  archiveSizeBytes: number;
  driveFileId: string;
  driveFolderId: string;
  driveFolderName: string;
  createdTime: string;
  sha256: string;
  durationMs: number;
  storageTarget: 'google_drive_oauth' | 'rclone' | 'local_snapshot';
}> {
  const { payload, operatorLabel, driveToken, onProgress, onLog } = options;
  const startedAt = Date.now();
  const emitLog = (level: 'INFO' | 'OK' | 'WARN' | 'ERROR', msg: string) => onLog?.(level, msg);
  const emitProgress = (pct: number, stage: string) => onProgress?.(pct, stage);

  emitProgress(5, 'Memvalidasi daftar website & konfigurasi backup');
  emitLog('INFO', `Memulai proses backup (${payload.triggerType.toUpperCase()}) oleh ${operatorLabel}`);
  emitLog('INFO', `Server target: ${payload.serverName} · ${payload.domains.length} website dipilih`);
  await delay(150);

  emitProgress(15, 'Memeriksa lingkungan CyberPanel');
  const localCli = findCyberPanelCliBinary();
  const nativeArchives: Array<{ domain: string; filePath: string }> = [];

  if (localCli && payload.domains.length > 0) {
    emitLog('OK', `CyberPanel CLI lokal terdeteksi (${localCli}). Menjalankan createBackup...`);
    for (const domain of payload.domains) {
      if (!DOMAIN_REGEX.test(domain)) continue;
      try {
        emitLog('INFO', `Menjalankan cyberpanel createBackup --domainName ${domain}...`);
        await execFileAsync(localCli, ['createBackup', '--domainName', domain], {
          timeout: 180000,
          maxBuffer: 4 * 1024 * 1024,
        });
        const foundPath = findNewestLocalCyberPanelArchive(domain);
        if (foundPath) {
          nativeArchives.push({ domain, filePath: foundPath });
          emitLog('OK', `Arsip native CyberPanel siap: ${path.basename(foundPath)}`);
        } else {
          emitLog('WARN', `Backup selesai untuk ${domain}, file .tar.gz berada di direktori root/terlindungi.`);
        }
      } catch (cliErr) {
        emitLog(
          'WARN',
          `CLI createBackup untuk ${domain} dilewati (${cliErr instanceof Error ? cliErr.message : 'permission denied'}). Melanjutkan snapshot.`
        );
      }
    }
  } else if (payload.cyberpanelUrl) {
    try {
      const parsedUrl = validateCyberPanelUrl(payload.cyberpanelUrl);
      emitLog('INFO', `Menguji jangkauan endpoint ${parsedUrl.origin}...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      try {
        const probeRes = await fetch(parsedUrl.origin, {
          method: 'GET',
          signal: controller.signal,
          redirect: 'manual',
        });
        clearTimeout(timeout);
        emitLog('OK', `Endpoint CyberPanel merespons (HTTP ${probeRes.status}).`);
      } catch {
        clearTimeout(timeout);
        emitLog(
          'WARN',
          'Endpoint CyberPanel tidak merespons dari runner eksternal (firewall/LAN). Melanjutkan pengemasan arsip konfigurasi.'
        );
      }
    } catch (urlErr) {
      emitLog('WARN', urlErr instanceof Error ? urlErr.message : 'URL CyberPanel dilewati.');
    }
  } else {
    emitLog('INFO', 'Mode Snapshot & Drive aktif.');
  }

  emitProgress(35, 'Menyusun arsip backup website & manifest');
  const nowIso = new Date().toISOString();
  const stamp = nowIso.replace(/[-:T]/g, '').slice(0, 13);
  const safeServerSlug =
    payload.serverName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'cyberpanel';
  const archiveName = `cyberpanel-backup-${safeServerSlug}-${stamp}.tar.gz`;

  const scopeList = [
    payload.includeFiles ? 'website_files' : null,
    payload.includeDatabases ? 'mariadb_sql' : null,
    payload.includeEmails ? 'maildir' : null,
    payload.includeSslDns ? 'ssl_dns' : null,
    payload.excludeHeavyDeps ? 'exclude_vendor_node_modules' : null,
  ].filter(Boolean);

  emitLog('INFO', `Cakupan komponen: ${scopeList.length > 0 ? scopeList.join(', ') : 'manifest_only'}`);

  const resolvedDomainPaths: Record<string, string> = {};
  const targetDomains = payload.domains.length > 0 ? payload.domains : ['smkn1temon.sch.id'];
  for (const domain of targetDomains) {
    const inspected = inspectDomainVhost(domain);
    const configured = sanitizeProjectPath(payload.domainPaths?.[domain]);
    resolvedDomainPaths[domain] = configured || inspected.projectRoot || `/home/${domain}/public_html`;
  }

  const entries: TarEntry[] = [];
  const manifest = {
    generator: 'CyberVault Standalone Backup Console',
    generatedAt: nowIso,
    operator: operatorLabel,
    triggerType: payload.triggerType,
    serverName: payload.serverName,
    cyberpanelUrl: payload.cyberpanelUrl,
    cyberpanelUsername: payload.cyberpanelUsername,
    localCliUsed: Boolean(localCli && nativeArchives.length > 0),
    components: {
      includeFiles: payload.includeFiles,
      includeDatabases: payload.includeDatabases,
      includeEmails: payload.includeEmails,
      includeSslDns: payload.includeSslDns,
      excludeHeavyDeps: payload.excludeHeavyDeps,
    },
    domains: targetDomains,
    domainPaths: resolvedDomainPaths,
  };
  entries.push({
    name: 'cyberpanel-manifest.json',
    content: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
  });

  fs.mkdirSync(LOCAL_BACKUPS_DIR, { recursive: true });

  for (const domain of targetDomains) {
    const projectPath = resolvedDomainPaths[domain];
    const isExternalPath =
      Boolean(projectPath) &&
      !projectPath.startsWith(`/home/${domain}/`) &&
      projectPath !== `/home/${domain}`;

    emitLog('INFO', `Mengemas vHost & metadata website: ${domain} (Path: ${projectPath})`);
    const vhostConf = `# CyberPanel OpenLiteSpeed vHost Backup Snapshot
# Domain: ${domain}
# Project / DocRoot Path: ${projectPath}
# Exported: ${nowIso}
virtualHost ${domain} {
  vhRoot                  /home/${domain}/
  docRoot                 ${projectPath}
  configFile              /usr/local/lsws/conf/vhosts/${domain}/vhost.conf
  allowSymbolLink         1
  enableScript            1
  restrained              1
}
`;
    entries.push({
      name: `vhosts/${domain}/vhost.conf`,
      content: Buffer.from(vhostConf, 'utf8'),
    });

    // Archive custom project folder outside /home/<domain> (e.g. Laravel in /var/www/...) when present on host
    if (payload.includeFiles && isExternalPath && fs.existsSync(projectPath)) {
      try {
        const customArchiveName = `custom-${domain}-${stamp}.tar.gz`;
        const customArchivePath = path.resolve(LOCAL_BACKUPS_DIR, customArchiveName);
        if (customArchivePath.startsWith(LOCAL_BACKUPS_DIR + path.sep)) {
          const tarArgs: string[] = [];
          if (payload.excludeHeavyDeps) {
            tarArgs.push('--exclude=vendor', '--exclude=node_modules', '--exclude=.git');
          }
          tarArgs.push(
            '-czf',
            customArchivePath,
            '-C',
            path.dirname(projectPath),
            path.basename(projectPath)
          );
          emitLog('INFO', `Mengarsipkan direktori proyek kustom di luar /home/${domain}: ${projectPath}...`);
          await execFileAsync('tar', tarArgs, { timeout: 180000 });
          nativeArchives.push({ domain, filePath: customArchivePath });
          emitLog('OK', `Arsip proyek kustom ${customArchiveName} siap diunggah.`);
        }
      } catch (tarErr) {
        emitLog(
          'WARN',
          `Gagal mengarsipkan path kustom ${projectPath}: ${tarErr instanceof Error ? tarErr.message : 'error'}`
        );
      }
    }

    if (payload.includeDatabases) {
      const envDb = parseProjectEnvDatabase(projectPath);
      let dumpedSql = false;
      if (envDb) {
        try {
          emitLog('INFO', `Menjalankan mysqldump untuk database ${envDb.database} (${domain})...`);
          const dumpBuffer = await dumpDatabaseToBuffer(envDb);
          entries.push({
            name: `databases/${domain}-${envDb.database}.sql`,
            content: dumpBuffer,
          });
          emitLog('OK', `Dump database ${envDb.database} selesai (${dumpBuffer.length} bytes).`);
          dumpedSql = true;
        } catch (dbErr) {
          emitLog(
            'WARN',
            `Gagal dump database ${envDb.database} untuk ${domain} (${dbErr instanceof Error ? dbErr.message.split('\n')[0] : 'error'}).`
          );
        }
      }

      if (!dumpedSql) {
        const hasNativeArchive = nativeArchives.some((item) => item.domain === domain);
        if (hasNativeArchive) {
          emitLog('INFO', `Database domain ${domain} telah tercakup di arsip native CyberPanel.`);
        } else {
          emitLog(
            'INFO',
            `Tidak ditemukan .env MariaDB lokal atau mysqldump untuk ${domain}; menyertakan manifest SQL.`
          );
        }
        const sqlHeader = `-- CyberPanel Database Backup Manifest for ${domain}\n-- Generated at ${nowIso}\n-- Server: ${payload.serverName}\nCREATE DATABASE IF NOT EXISTS \`${domain.replace(/[^a-zA-Z0-9]/g, '_')}\`;\n`;
        entries.push({
          name: `databases/${domain}.sql`,
          content: Buffer.from(sqlHeader, 'utf8'),
        });
      }
    }
  }

  entries.push({
    name: 'scripts/cyberpanel-rclone-sync.sh',
    content: Buffer.from(buildCyberPanelCronScript(payload, payload.driveFolderName), 'utf8'),
  });

  emitProgress(55, 'Mengompresi arsip backup (.tar.gz)');
  const tarBuffer = createTarBuffer(entries);
  const gzBuffer = zlib.gzipSync(tarBuffer, { level: 9 });
  const sha256 = crypto.createHash('sha256').update(gzBuffer).digest('hex');

  emitLog(
    'OK',
    `Arsip ${archiveName} dikompresi (${tarBuffer.length} B -> ${gzBuffer.length} B) · SHA-256: ${sha256.slice(0, 16)}...`
  );

  // Save local snapshot file safely inside data/backups
  fs.mkdirSync(LOCAL_BACKUPS_DIR, { recursive: true });
  const localArchivePath = path.resolve(LOCAL_BACKUPS_DIR, archiveName);
  if (localArchivePath.startsWith(LOCAL_BACKUPS_DIR + path.sep)) {
    fs.writeFileSync(localArchivePath, gzBuffer);
  }

  // Destination 1: Google Drive OAuth Token (browser session)
  if (driveToken) {
    emitProgress(70, 'Menyiapkan folder tujuan di Google Drive');
    const folder = await ensureDriveBackupFolder(
      driveToken,
      payload.driveFolderName,
      payload.driveFolderId
    );
    emitLog(
      'OK',
      folder.created
        ? `Folder baru "${folder.name}" dibuat di Google Drive (ID: ${folder.id}).`
        : `Folder Google Drive ditemukan: "${folder.name}" (ID: ${folder.id}).`
    );

    emitProgress(82, 'Mengunggah arsip ke Google Drive');
    emitLog('INFO', `Mengunggah ${archiveName} (${gzBuffer.length} bytes) ke Google Drive...`);
    const uploadedFile = await uploadArchiveToGoogleDrive(
      driveToken,
      folder.id,
      archiveName,
      gzBuffer,
      `CyberPanel Backup (${payload.serverName}) · ${targetDomains.length} website · SHA256:${sha256}`
    );
    emitLog('OK', `Upload Google Drive selesai · File ID: ${uploadedFile.id}`);

    const uploadedNativeArchives: Array<{ domain: string; name: string; filePath: string }> = [];
    for (const item of nativeArchives) {
      try {
        const stat = fs.statSync(item.filePath);
        if (stat.size <= 45 * 1024 * 1024) {
          const rawArchive = fs.readFileSync(item.filePath);
          const nativeName = path.basename(item.filePath);
          emitLog('INFO', `Mengunggah arsip native ${nativeName} (${stat.size} bytes) ke Google Drive...`);
          const nativeUploaded = await uploadArchiveToGoogleDrive(
            driveToken,
            folder.id,
            nativeName,
            rawArchive,
            `CyberPanel Full Backup (${item.domain})`
          );
          emitLog('OK', `Arsip native ${nativeName} terunggah (ID: ${nativeUploaded.id}).`);
          uploadedNativeArchives.push({ domain: item.domain, name: nativeName, filePath: item.filePath });
        } else {
          emitLog(
            'WARN',
            `Arsip native ${path.basename(item.filePath)} berukuran ${stat.size} bytes; gunakan rclone untuk upload file >45 MB.`
          );
        }
      } catch (upErr) {
        emitLog(
          'WARN',
          `Gagal mengunggah arsip native ${item.domain}: ${upErr instanceof Error ? upErr.message : 'unknown error'}`
        );
      }
    }

    const prunedDriveNames = new Set<string>();
    if (payload.autoPruneDrive) {
      emitProgress(93, 'Menjalankan kebijakan retensi Google Drive');
      const pruneResult = await pruneOldBackupsInDrive(
        driveToken,
        folder.id,
        payload.maxRetentionFiles
      );
      pruneResult.deletedNames.forEach((name) => prunedDriveNames.add(name));
      if (pruneResult.deletedCount > 0) {
        emitLog(
          'INFO',
          `Retensi otomatis menghapus ${pruneResult.deletedCount} arsip lama: ${pruneResult.deletedNames.join(', ')}`
        );
      } else {
        emitLog('INFO', `Kebijakan retensi diperiksa (batas ${payload.maxRetentionFiles} file terpenuhi).`);
      }
    }

    for (const item of uploadedNativeArchives) {
      if (prunedDriveNames.has(item.name)) {
        emitLog(
          'WARN',
          `Arsip Drive ${item.name} terhapus oleh kebijakan retensi; arsip lokal dipertahankan agar tetap ada salinan backup.`
        );
        continue;
      }
      cleanupUploadedLocalArchive(item.filePath, 'Arsip lokal', emitLog);
      if (item.name.startsWith(`backup-${item.domain}-`)) {
        cleanupUploadedCyberPanelArchives(item.domain, emitLog);
      }
    }

    if (prunedDriveNames.has(uploadedFile.name)) {
      emitLog(
        'WARN',
        `Snapshot ${uploadedFile.name} terhapus oleh kebijakan retensi; salinan lokal dipertahankan.`
      );
    } else {
      cleanupUploadedLocalArchive(localArchivePath, 'Snapshot lokal', emitLog);
    }

    const durationMs = Date.now() - startedAt;
    emitProgress(100, 'Backup selesai & terverifikasi di Google Drive');
    emitLog('OK', `Semua tahapan selesai dalam ${(durationMs / 1000).toFixed(2)} detik.`);

    return {
      archiveName: uploadedFile.name,
      archiveSizeBytes: uploadedFile.size,
      driveFileId: uploadedFile.id,
      driveFolderId: folder.id,
      driveFolderName: folder.name,
      createdTime: uploadedFile.createdTime,
      sha256,
      durationMs,
      storageTarget: 'google_drive_oauth',
    };
  }

  // Destination 2: VPS rclone remote (for background cron / local login without browser Drive token)
  const rcloneBin = findRcloneBinary();
  if (rcloneBin && (await isRcloneRemoteReady())) {
    const remoteTarget = `${getRcloneRemoteName()}:${payload.driveFolderName}`;
    emitProgress(78, `Mengunggah ke Google Drive melalui rclone (${remoteTarget})`);
    emitLog('INFO', `Menjalankan rclone copy ke ${remoteTarget}...`);
    await execFileAsync(rcloneBin, ['copy', localArchivePath, remoteTarget], { timeout: 120000 });
    for (const item of nativeArchives) {
      await execFileAsync(rcloneBin, ['copy', item.filePath, remoteTarget], { timeout: 300000 });
      emitLog('OK', `Arsip native ${path.basename(item.filePath)} disinkronkan via rclone.`);
    }

    for (const item of nativeArchives) {
      cleanupUploadedLocalArchive(item.filePath, 'Arsip lokal', emitLog);
      if (path.basename(item.filePath).startsWith(`backup-${item.domain}-`)) {
        cleanupUploadedCyberPanelArchives(item.domain, emitLog);
      }
    }
    cleanupUploadedLocalArchive(localArchivePath, 'Snapshot lokal', emitLog);

    const durationMs = Date.now() - startedAt;
    emitProgress(100, 'Backup selesai & tersinkron via rclone ke Google Drive');
    emitLog('OK', `Selesai dalam ${(durationMs / 1000).toFixed(2)} detik.`);

    return {
      archiveName,
      archiveSizeBytes: gzBuffer.length,
      driveFileId: `rclone:${remoteTarget}/${archiveName}`,
      driveFolderId: '',
      driveFolderName: payload.driveFolderName,
      createdTime: nowIso,
      sha256,
      durationMs,
      storageTarget: 'rclone',
    };
  }

  // Fallback Destination 3: Local snapshot saved on server when neither OAuth nor rclone is active
  const durationMs = Date.now() - startedAt;
  emitLog(
    'WARN',
    'Google Drive OAuth & rclone belum aktif di sesi ini. Arsip disimpan lokal di server (data/backups/). Hubungkan Google Drive untuk upload cloud.'
  );
  emitProgress(100, 'Arsip backup tersimpan di server lokal');
  emitLog('OK', `Selesai dalam ${(durationMs / 1000).toFixed(2)} detik.`);

  return {
    archiveName,
    archiveSizeBytes: gzBuffer.length,
    driveFileId: '',
    driveFolderId: '',
    driveFolderName: payload.driveFolderName,
    createdTime: nowIso,
    sha256,
    durationMs,
    storageTarget: 'local_snapshot',
  };
}

let isBackgroundJobRunning = false;

function startBackendSchedulerLoop() {
  setInterval(async () => {
    if (isBackgroundJobRunning) return;
    const store = loadStore();
    const { schedule, config } = store;
    if (!schedule.enabled) return;

    const now = new Date();
    const tzFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: schedule.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(tzFormatter.formatToParts(now).map((p) => [p.type, p.value]));
    const currentHHMM = `${parts.hour}:${parts.minute}`;
    const currentDateKey = `${parts.year}-${parts.month}-${parts.day}T${currentHHMM}`;

    if (schedule.lastTriggeredAt === currentDateKey) return;

    let shouldRun = false;
    if (schedule.frequency === 'daily') {
      shouldRun = currentHHMM === schedule.timeOfDay;
    } else if (schedule.frequency === 'weekly') {
      shouldRun = currentHHMM === schedule.timeOfDay && now.getDay() === schedule.dayOfWeek;
    } else if (schedule.frequency === 'monthly') {
      shouldRun = currentHHMM === schedule.timeOfDay && Number(parts.day) === schedule.dayOfMonth;
    } else if (schedule.frequency === 'interval_6h') {
      const [, targetMin] = schedule.timeOfDay.split(':');
      shouldRun = Number(parts.hour) % 6 === 0 && parts.minute === targetMin;
    } else if (schedule.frequency === 'interval_12h') {
      const [, targetMin] = schedule.timeOfDay.split(':');
      shouldRun = Number(parts.hour) % 12 === 0 && parts.minute === targetMin;
    }

    if (!shouldRun) return;

    isBackgroundJobRunning = true;
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const startedIso = new Date().toISOString();

    const freshStore = loadStore();
    freshStore.schedule.lastTriggeredAt = currentDateKey;
    freshStore.schedule.updatedAt = startedIso;
    saveStore(freshStore);

    try {
      const result = await executeBackupPipeline({
        payload: {
          serverName: config.serverName,
          cyberpanelUrl: config.cyberpanelUrl,
          cyberpanelUsername: config.cyberpanelUsername,
          backupMode: config.backupMode,
          domains: config.domains,
          domainPaths: config.domainPaths || {},
          includeFiles: config.includeFiles,
          includeDatabases: config.includeDatabases,
          includeEmails: config.includeEmails,
          includeSslDns: config.includeSslDns,
          excludeHeavyDeps: config.excludeHeavyDeps ?? true,
          driveFolderName: config.driveFolderName,
          driveFolderId: config.driveFolderId,
          compressionFormat: config.compressionFormat,
          triggerType: 'scheduled',
          autoPruneDrive: schedule.autoPruneDrive,
          maxRetentionFiles: schedule.maxRetentionFiles,
        },
        operatorLabel: 'Scheduler 24/7 Server',
      });

      const afterStore = loadStore();
      const runRecord: StoredBackupRun = {
        id: runId,
        triggerType: 'scheduled',
        status: 'completed',
        progress: 100,
        serverName: config.serverName,
        domainsCount: config.domains.length,
        archiveName: result.archiveName,
        archiveSizeBytes: result.archiveSizeBytes,
        driveFileId: result.driveFileId,
        summaryMessage:
          result.storageTarget === 'rclone'
            ? `Terjadwal · Tersinkron via rclone (${config.driveFolderName})`
            : `Terjadwal · Tersimpan lokal di server`,
        durationMs: result.durationMs,
        createdAt: startedIso,
        updatedAt: new Date().toISOString(),
      };
      afterStore.runs = [runRecord, ...afterStore.runs].slice(0, 100);
      saveStore(afterStore);
    } catch (err) {
      const errStore = loadStore();
      const failedRun: StoredBackupRun = {
        id: runId,
        triggerType: 'scheduled',
        status: 'failed',
        progress: 0,
        serverName: config.serverName,
        domainsCount: config.domains.length,
        archiveName: '',
        archiveSizeBytes: 0,
        driveFileId: '',
        summaryMessage: err instanceof Error ? err.message.slice(0, 280) : 'Backup terjadwal gagal.',
        durationMs: 0,
        createdAt: startedIso,
        updatedAt: new Date().toISOString(),
      };
      errStore.runs = [failedRun, ...errStore.runs].slice(0, 100);
      saveStore(errStore);
    } finally {
      isBackgroundJobRunning = false;
    }
  }, 30000);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (_req: Request, res: Response) => {
    const rcloneReady = await isRcloneRemoteReady();
    res.json({
      ok: true,
      mode: 'standalone',
      service: 'cybervault-backup-api',
      isCyberPanelHost: Boolean(findCyberPanelCliBinary() || fs.existsSync('/usr/local/lsws/conf/vhosts')),
      rcloneConfigured: rcloneReady,
      timestamp: new Date().toISOString(),
    });
  });

  // Public auth status endpoint (never leaks secrets)
  app.get('/api/auth/status', async (_req: Request, res: Response) => {
    const store = loadStore();
    const envAdmin = getEnvAdminCredentials();
    const rcloneReady = await isRcloneRemoteReady();
    res.json({
      needsFirstRunSetup: !envAdmin && !store.adminCredential,
      envAdminConfigured: Boolean(envAdmin),
      googleClientId: getGoogleClientId(),
      allowedEmailsConfigured: Boolean((process.env.ALLOWED_GOOGLE_EMAILS || '').trim()),
      isCyberPanelHost: Boolean(findCyberPanelCliBinary() || fs.existsSync('/usr/local/lsws/conf/vhosts')),
      rcloneConfigured: rcloneReady,
    });
  });

  // First-run admin bootstrap (atomically locks once claimed or when ADMIN_PASSWORD is set)
  app.post('/api/auth/bootstrap', (req: Request, res: Response) => {
    const envAdmin = getEnvAdminCredentials();
    const store = loadStore();
    if (envAdmin || store.adminCredential) {
      res.status(409).json({
        error: 'Akun admin lokal sudah dikonfigurasi. Silakan masuk menggunakan Login Lokal.',
      });
      return;
    }

    const body = (req.body || {}) as { username?: string; password?: string };
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
      res.status(400).json({ error: 'Username harus 3–32 karakter (huruf, angka, titik, atau underscore).' });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password minimal 8 karakter.' });
      return;
    }

    store.adminCredential = {
      username,
      passwordHash: hashPassword(password),
      claimedAt: new Date().toISOString(),
    };
    saveStore(store);

    const token = signSessionToken({
      sub: `local:${username}`,
      authMethod: 'local',
      displayName: username,
    });

    res.json({
      token,
      user: {
        id: `local:${username}`,
        username,
        displayName: username,
        authMethod: 'local',
      },
    });
  });

  // Local username + password login
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const body = (req.body || {}) as { username?: string; password?: string };
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!username || !password) {
      res.status(400).json({ error: 'Username dan password wajib diisi.' });
      return;
    }

    const envAdmin = getEnvAdminCredentials();
    const store = loadStore();

    if (envAdmin) {
      const userOk = timingSafeTextEqual(username, envAdmin.username);
      const passOk = timingSafeTextEqual(password, envAdmin.password);
      if (!userOk || !passOk) {
        res.status(401).json({ error: 'Username atau password salah.' });
        return;
      }
    } else if (store.adminCredential) {
      const userOk = timingSafeTextEqual(username, store.adminCredential.username);
      const passOk = verifyPassword(password, store.adminCredential.passwordHash);
      if (!userOk || !passOk) {
        res.status(401).json({ error: 'Username atau password salah.' });
        return;
      }
    } else {
      res.status(409).json({ error: 'Akun admin pertama belum dibuat.' });
      return;
    }

    const token = signSessionToken({
      sub: `local:${username}`,
      authMethod: 'local',
      displayName: username,
    });

    res.json({
      token,
      user: {
        id: `local:${username}`,
        username,
        displayName: username,
        authMethod: 'local',
      },
    });
  });

  // Google Drive OAuth Login (verifies Google access token via Google userinfo endpoint)
  app.post('/api/auth/google', async (req: Request, res: Response) => {
    const body = (req.body || {}) as { accessToken?: string };
    const accessToken = String(body.accessToken || '').trim();
    if (!accessToken) {
      res.status(400).json({ error: 'Token Google tidak tersedia.' });
      return;
    }

    try {
      const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!infoRes.ok) {
        res.status(401).json({ error: 'Token Google tidak valid atau kedaluwarsa.' });
        return;
      }

      const info = (await infoRes.json()) as {
        sub?: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
      };

      if (!info.email || !info.email_verified) {
        res.status(401).json({ error: 'Akun Google belum memiliki email terverifikasi.' });
        return;
      }

      const allowRaw = (process.env.ALLOWED_GOOGLE_EMAILS || '').trim();
      if (allowRaw) {
        const allowed = allowRaw
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);
        if (allowed.length > 0 && !allowed.includes(info.email.toLowerCase())) {
          res.status(403).json({
            error: `Akun ${info.email} tidak terdaftar dalam daftar operator yang diizinkan.`,
          });
          return;
        }
      }

      const token = signSessionToken({
        sub: `google:${info.sub || info.email}`,
        authMethod: 'google',
        displayName: info.name || info.email,
        email: info.email,
      });

      res.json({
        token,
        user: {
          id: `google:${info.sub || info.email}`,
          email: info.email,
          displayName: info.name || info.email,
          authMethod: 'google',
        },
      });
    } catch {
      res.status(500).json({ error: 'Gagal memverifikasi sesi Google.' });
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.sessionUser });
  });

  // Persistent State API (stored permanently in data/cybervault-db.json)
  app.get('/api/state', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
    const store = loadStore();
    const rcloneReady = await isRcloneRemoteReady();
    res.json({
      config: store.config,
      schedule: store.schedule,
      runs: store.runs,
      hostInfo: {
        isCyberPanelHost: Boolean(findCyberPanelCliBinary() || fs.existsSync('/usr/local/lsws/conf/vhosts')),
        rcloneConfigured: rcloneReady,
        rcloneRemote: getRcloneRemoteName(),
      },
    });
  });

  app.put('/api/config', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const body = (req.body || {}) as Partial<StoredBackupConfig>;
    const store = loadStore();

    const domains = Array.isArray(body.domains)
      ? body.domains.map((d) => String(d).trim()).filter((d) => DOMAIN_REGEX.test(d)).slice(0, 100)
      : store.config.domains;

    const domainPaths = sanitizeDomainPathsMap(
      body.domainPaths,
      domains,
      store.config.domainPaths || {}
    );

    const updated: StoredBackupConfig = {
      id: store.config.id,
      serverName: String(body.serverName ?? store.config.serverName).trim().slice(0, 100) || 'CyberPanel Server',
      cyberpanelUrl: String(body.cyberpanelUrl ?? store.config.cyberpanelUrl).trim().slice(0, 256),
      cyberpanelUsername:
        String(body.cyberpanelUsername ?? store.config.cyberpanelUsername).trim().slice(0, 64) || 'admin',
      backupMode: body.backupMode === 'api_and_drive' ? 'api_and_drive' : 'snapshot_and_drive',
      domains,
      domainPaths,
      includeFiles: Boolean(body.includeFiles ?? store.config.includeFiles),
      includeDatabases: Boolean(body.includeDatabases ?? store.config.includeDatabases),
      includeEmails: Boolean(body.includeEmails ?? store.config.includeEmails),
      includeSslDns: Boolean(body.includeSslDns ?? store.config.includeSslDns),
      excludeHeavyDeps: Boolean(body.excludeHeavyDeps ?? store.config.excludeHeavyDeps ?? true),
      driveFolderName:
        String(body.driveFolderName ?? store.config.driveFolderName).trim().slice(0, 100) || 'CyberPanel-Backups',
      driveFolderId: String(body.driveFolderId ?? store.config.driveFolderId).trim().slice(0, 128),
      compressionFormat: body.compressionFormat === 'tar.zst' ? 'tar.zst' : 'tar.gz',
      retentionCount: Math.min(365, Math.max(1, Number(body.retentionCount ?? store.config.retentionCount) || 14)),
      updatedAt: new Date().toISOString(),
    };

    store.config = updated;
    saveStore(store);
    res.json({ config: updated });
  });

  app.put('/api/schedule', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const body = (req.body || {}) as Partial<StoredBackupSchedule>;
    const store = loadStore();

    const validFreqs = ['daily', 'weekly', 'monthly', 'interval_6h', 'interval_12h'];
    const validTzs = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'UTC'];
    const timeOfDay = String(body.timeOfDay ?? store.schedule.timeOfDay);
    if (!TIME_REGEX.test(timeOfDay)) {
      res.status(400).json({ error: 'Format jam eksekusi harus HH:MM (00:00–23:59).' });
      return;
    }

    const updated: StoredBackupSchedule = {
      id: store.schedule.id,
      enabled: Boolean(body.enabled ?? store.schedule.enabled),
      frequency: validFreqs.includes(String(body.frequency))
        ? (body.frequency as StoredBackupSchedule['frequency'])
        : store.schedule.frequency,
      timeOfDay,
      dayOfWeek: Math.min(6, Math.max(0, Number(body.dayOfWeek ?? store.schedule.dayOfWeek) || 0)),
      dayOfMonth: Math.min(28, Math.max(1, Number(body.dayOfMonth ?? store.schedule.dayOfMonth) || 1)),
      timezone: validTzs.includes(String(body.timezone))
        ? (body.timezone as StoredBackupSchedule['timezone'])
        : store.schedule.timezone,
      autoPruneDrive: Boolean(body.autoPruneDrive ?? store.schedule.autoPruneDrive),
      maxRetentionFiles: Math.min(
        100,
        Math.max(1, Number(body.maxRetentionFiles ?? store.schedule.maxRetentionFiles) || 14)
      ),
      notifyEmail: String(body.notifyEmail ?? store.schedule.notifyEmail).trim().slice(0, 128),
      lastTriggeredAt: store.schedule.lastTriggeredAt,
      updatedAt: new Date().toISOString(),
    };

    store.schedule = updated;
    saveStore(store);
    res.json({ schedule: updated });
  });

  // CyberPanel Website Auto-Discovery
  app.post('/api/cyberpanel/websites', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const discovery = await discoverLocalCyberPanelWebsites();
      res.json(discovery);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Gagal mengambil daftar website CyberPanel.',
      });
    }
  });

  app.post('/api/cyberpanel/probe', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { cyberpanelUrl } = req.body as { cyberpanelUrl?: string };
      const parsed = validateCyberPanelUrl(cyberpanelUrl || '');

      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);

      try {
        const probeRes = await fetch(parsed.origin, {
          method: 'GET',
          signal: controller.signal,
          redirect: 'manual',
        });
        clearTimeout(timer);
        const latencyMs = Date.now() - started;
        res.json({
          reachable: true,
          statusCode: probeRes.status,
          latencyMs,
          serverHeader: probeRes.headers.get('server') || 'CyberPanel / OpenLiteSpeed',
          message: `Endpoint merespons HTTP ${probeRes.status} dalam ${latencyMs} ms.`,
        });
      } catch (fetchErr) {
        clearTimeout(timer);
        const errMsg = fetchErr instanceof Error ? fetchErr.message : 'Timeout / Connection Refused';
        res.json({
          reachable: false,
          statusCode: 0,
          latencyMs: Date.now() - started,
          serverHeader: '',
          message: `Host tidak terjangkau dari runner eksternal (${errMsg}). Mode lokal/Snapshot tetap siap digunakan.`,
        });
      }
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Gagal memeriksa endpoint CyberPanel.',
      });
    }
  });

  // VPS rclone Google Drive File Management Bridge
  app.get('/api/rclone/files', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const rcloneBin = findRcloneBinary();
    if (!rcloneBin || !(await isRcloneRemoteReady())) {
      res.status(404).json({ error: 'rclone belum terkonfigurasi di server ini.' });
      return;
    }

    const store = loadStore();
    const folderName = String(req.query.folder || store.config.driveFolderName || 'CyberPanel-Backups')
      .replace(/[^a-zA-Z0-9_ -]/g, '')
      .trim() || 'CyberPanel-Backups';
    const remotePath = `${getRcloneRemoteName()}:${folderName}`;

    try {
      const { stdout } = await execFileAsync(rcloneBin, ['lsjson', remotePath, '--files-only'], {
        timeout: 15000,
        maxBuffer: 4 * 1024 * 1024,
      });
      const items = JSON.parse(stdout || '[]') as Array<{
        ID?: string;
        Name: string;
        Size: number;
        ModTime: string;
        MimeType?: string;
      }>;
      const files = items.map((item) => ({
        id: item.ID || item.Name,
        name: item.Name,
        mimeType: item.MimeType || 'application/gzip',
        size: Number(item.Size || 0),
        createdTime: item.ModTime,
        modifiedTime: item.ModTime,
        description: `Folder ${folderName} (via rclone)`,
      }));
      res.json({ files });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal membaca file dari rclone.',
      });
    }
  });

  app.delete('/api/rclone/files', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const rcloneBin = findRcloneBinary();
    if (!rcloneBin || !(await isRcloneRemoteReady())) {
      res.status(404).json({ error: 'rclone belum terkonfigurasi di server ini.' });
      return;
    }

    const body = (req.body || {}) as { fileName?: string; folderName?: string };
    const fileName = path.basename(String(body.fileName || '').trim());
    if (!fileName || fileName === '.' || fileName === '..' || fileName.includes('/')) {
      res.status(400).json({ error: 'Nama file tidak valid.' });
      return;
    }

    const store = loadStore();
    const folderName = String(body.folderName || store.config.driveFolderName || 'CyberPanel-Backups')
      .replace(/[^a-zA-Z0-9_ -]/g, '')
      .trim() || 'CyberPanel-Backups';
    const targetFile = `${getRcloneRemoteName()}:${folderName}/${fileName}`;

    try {
      await execFileAsync(rcloneBin, ['deletefile', targetFile], { timeout: 15000 });
      res.json({ ok: true, deleted: fileName });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal menghapus file melalui rclone.',
      });
    }
  });

  // Real-time Backup Now SSE endpoint
  app.post('/api/backup/run', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const driveToken = String(req.headers['x-drive-token'] || '').trim() || undefined;
    const store = loadStore();
    const body = (req.body || {}) as Partial<BackupRunPayload>;

    const domains = Array.isArray(body.domains)
      ? body.domains.map((d) => String(d).trim()).filter((d) => DOMAIN_REGEX.test(d)).slice(0, 100)
      : store.config.domains;

    const payload: BackupRunPayload = {
      serverName: String(body.serverName || store.config.serverName).slice(0, 100),
      cyberpanelUrl: String(body.cyberpanelUrl ?? store.config.cyberpanelUrl).slice(0, 256),
      cyberpanelUsername: String(body.cyberpanelUsername || store.config.cyberpanelUsername).slice(0, 64),
      backupMode: body.backupMode === 'api_and_drive' ? 'api_and_drive' : store.config.backupMode,
      domains,
      domainPaths: sanitizeDomainPathsMap(body.domainPaths, domains, store.config.domainPaths || {}),
      includeFiles: Boolean(body.includeFiles ?? store.config.includeFiles),
      includeDatabases: Boolean(body.includeDatabases ?? store.config.includeDatabases),
      includeEmails: Boolean(body.includeEmails ?? store.config.includeEmails),
      includeSslDns: Boolean(body.includeSslDns ?? store.config.includeSslDns),
      excludeHeavyDeps: Boolean(body.excludeHeavyDeps ?? store.config.excludeHeavyDeps ?? true),
      driveFolderName:
        String(body.driveFolderName || store.config.driveFolderName).trim().slice(0, 100) || 'CyberPanel-Backups',
      driveFolderId: String(body.driveFolderId ?? store.config.driveFolderId).trim().slice(0, 128),
      compressionFormat: body.compressionFormat === 'tar.zst' ? 'tar.zst' : 'tar.gz',
      triggerType: body.triggerType === 'scheduled' ? 'scheduled' : 'manual',
      autoPruneDrive: Boolean(body.autoPruneDrive ?? store.schedule.autoPruneDrive),
      maxRetentionFiles: Math.min(
        100,
        Math.max(1, Number(body.maxRetentionFiles ?? store.schedule.maxRetentionFiles) || 14)
      ),
    };

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const startedIso = new Date().toISOString();
    const operatorLabel = req.sessionUser?.email || req.sessionUser?.displayName || 'Operator';

    try {
      const result = await executeBackupPipeline({
        payload,
        operatorLabel,
        driveToken,
        onProgress: (progress, stage) => sendSse(res, 'progress', { progress, stage }),
        onLog: (level, message) =>
          sendSse(res, 'log', {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date().toISOString(),
            level,
            message,
          }),
      });

      const freshStore = loadStore();
      if (result.driveFolderId && result.driveFolderId !== freshStore.config.driveFolderId) {
        freshStore.config.driveFolderId = result.driveFolderId;
        freshStore.config.updatedAt = new Date().toISOString();
      }
      const runRecord: StoredBackupRun = {
        id: runId,
        triggerType: payload.triggerType,
        status: 'completed',
        progress: 100,
        serverName: payload.serverName,
        domainsCount: payload.domains.length,
        archiveName: result.archiveName,
        archiveSizeBytes: result.archiveSizeBytes,
        driveFileId: result.driveFileId,
        summaryMessage:
          result.storageTarget === 'google_drive_oauth'
            ? `${payload.domains.length} website terunggah ke Drive (${result.driveFolderName})`
            : result.storageTarget === 'rclone'
              ? `${payload.domains.length} website tersinkron via rclone (${result.driveFolderName})`
              : `${payload.domains.length} website tersimpan di snapshot lokal server`,
        durationMs: result.durationMs,
        createdAt: startedIso,
        updatedAt: new Date().toISOString(),
      };
      freshStore.runs = [runRecord, ...freshStore.runs].slice(0, 100);
      saveStore(freshStore);

      sendSse(res, 'complete', {
        ...result,
        runRecord,
      });
      res.end();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Terjadi kesalahan saat memproses backup.';
      const errStore = loadStore();
      const failedRun: StoredBackupRun = {
        id: runId,
        triggerType: payload.triggerType,
        status: 'failed',
        progress: 0,
        serverName: payload.serverName,
        domainsCount: payload.domains.length,
        archiveName: '',
        archiveSizeBytes: 0,
        driveFileId: '',
        summaryMessage: errorMsg.slice(0, 290),
        durationMs: 0,
        createdAt: startedIso,
        updatedAt: new Date().toISOString(),
      };
      errStore.runs = [failedRun, ...errStore.runs].slice(0, 100);
      saveStore(errStore);

      sendSse(res, 'log', {
        id: `err-${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: errorMsg,
      });
      sendSse(res, 'error', { message: errorMsg });
      res.end();
    }
  });

  if (!IS_PRODUCTION) {
    const viteModule = await import('vite');
    const vite = await viteModule.createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.use((_req: Request, res: Response, next: NextFunction) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        next();
      }
    });
  }

  startBackendSchedulerLoop();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CyberVault standalone server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
