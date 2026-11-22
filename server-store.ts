import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface StoredAdminCredential {
  username: string;
  passwordHash: string;
  claimedAt: string;
}

export interface StoredBackupConfig {
  id: string;
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
  retentionCount: number;
  updatedAt: string;
}

export interface StoredBackupSchedule {
  id: string;
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly' | 'interval_6h' | 'interval_12h';
  timeOfDay: string;
  dayOfWeek: number;
  dayOfMonth: number;
  timezone: 'Asia/Jakarta' | 'Asia/Makassar' | 'Asia/Jayapura' | 'UTC';
  autoPruneDrive: boolean;
  maxRetentionFiles: number;
  notifyEmail: string;
  lastTriggeredAt: string;
  updatedAt: string;
}

export interface StoredBackupRun {
  id: string;
  triggerType: 'manual' | 'scheduled';
  status: 'running' | 'completed' | 'failed';
  progress: number;
  serverName: string;
  domainsCount: number;
  archiveName: string;
  archiveSizeBytes: number;
  driveFileId: string;
  summaryMessage: string;
  durationMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface CyberVaultStoreData {
  adminCredential: StoredAdminCredential | null;
  config: StoredBackupConfig;
  schedule: StoredBackupSchedule;
  runs: StoredBackupRun[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'cybervault-db.json');

function createDefaultStoreData(): CyberVaultStoreData {
  const now = new Date().toISOString();
  return {
    adminCredential: null,
    config: {
      id: 'default-config',
      serverName: 'Server CyberPanel SMKN 1 Temon',
      cyberpanelUrl: 'https://smkn1temon.sch.id:8090',
      cyberpanelUsername: 'admin',
      backupMode: 'snapshot_and_drive',
      domains: ['smkn1temon.sch.id'],
      domainPaths: {
        'smkn1temon.sch.id': '/home/smkn1temon.sch.id/public_html',
      },
      includeFiles: true,
      includeDatabases: true,
      includeEmails: true,
      includeSslDns: true,
      excludeHeavyDeps: true,
      driveFolderName: 'CyberPanel-Backups',
      driveFolderId: '',
      compressionFormat: 'tar.gz',
      retentionCount: 14,
      updatedAt: now,
    },
    schedule: {
      id: 'default-schedule',
      enabled: true,
      frequency: 'daily',
      timeOfDay: '02:00',
      dayOfWeek: 0,
      dayOfMonth: 1,
      timezone: 'Asia/Jakarta',
      autoPruneDrive: true,
      maxRetentionFiles: 14,
      notifyEmail: 'datacenter2@smkn1temon.sch.id',
      lastTriggeredAt: '',
      updatedAt: now,
    },
    runs: [],
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function loadStore(): CyberVaultStoreData {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const initial = createDefaultStoreData();
    saveStore(initial);
    return initial;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CyberVaultStoreData>;
    const defaults = createDefaultStoreData();
    return {
      adminCredential: parsed.adminCredential ?? null,
      config: { ...defaults.config, ...(parsed.config || {}) },
      schedule: { ...defaults.schedule, ...(parsed.schedule || {}) },
      runs: Array.isArray(parsed.runs) ? parsed.runs.slice(0, 100) : [],
    };
  } catch {
    const fallback = createDefaultStoreData();
    saveStore(fallback);
    return fallback;
  }
}

export function saveStore(data: CyberVaultStoreData): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempPath = `${DB_FILE}.tmp.${process.pid}`;
  const serialized = JSON.stringify(data, null, 2);
  fs.writeFileSync(tempPath, serialized, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tempPath, DB_FILE);
}
