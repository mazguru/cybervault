import { useEffect, useState } from 'react';
import {
  Activity,
  Check,
  Copy,
  Download,
  FolderPlus,
  Plus,
  RefreshCw,
  Save,
  Terminal,
  Trash2,
} from 'lucide-react';
import { generateRcloneScript } from '../lib/format';
import type { BackupConfig, BackupSchedule } from '../types/backup';

interface ServerConfigPanelProps {
  config: BackupConfig;
  schedule: BackupSchedule;
  isSyncingWebsites: boolean;
  syncStatusMsg: string | null;
  onSyncWebsites: () => Promise<string[]>;
  onSaveConfig: (updated: Omit<BackupConfig, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onProbeEndpoint: (url: string) => Promise<{
    reachable: boolean;
    statusCode: number;
    latencyMs: number;
    message: string;
  }>;
  onVerifyDriveFolder: (folderName: string) => Promise<{ id: string; name: string }>;
}

export function ServerConfigPanel({
  config,
  schedule,
  isSyncingWebsites,
  syncStatusMsg,
  onSyncWebsites,
  onSaveConfig,
  onProbeEndpoint,
  onVerifyDriveFolder,
}: ServerConfigPanelProps) {
  const [serverName, setServerName] = useState(config.serverName);
  const [cyberpanelUrl, setCyberpanelUrl] = useState(config.cyberpanelUrl);
  const [cyberpanelUsername, setCyberpanelUsername] = useState(config.cyberpanelUsername);
  const [backupMode, setBackupMode] = useState<'api_and_drive' | 'snapshot_and_drive'>(
    config.backupMode
  );
  const [domains, setDomains] = useState<string[]>(config.domains);
  const [domainPaths, setDomainPaths] = useState<Record<string, string>>(config.domainPaths || {});
  const [newDomain, setNewDomain] = useState('');
  const [newDomainPath, setNewDomainPath] = useState('');
  const [includeFiles, setIncludeFiles] = useState(config.includeFiles);
  const [includeDatabases, setIncludeDatabases] = useState(config.includeDatabases);
  const [includeEmails, setIncludeEmails] = useState(config.includeEmails);
  const [includeSslDns, setIncludeSslDns] = useState(config.includeSslDns);
  const [excludeHeavyDeps, setExcludeHeavyDeps] = useState(config.excludeHeavyDeps ?? true);
  const [driveFolderName, setDriveFolderName] = useState(config.driveFolderName);
  const [driveFolderId, setDriveFolderId] = useState(config.driveFolderId);
  const [compressionFormat, setCompressionFormat] = useState<'tar.gz' | 'tar.zst'>(
    config.compressionFormat
  );

  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isProbing, setIsProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<{
    reachable: boolean;
    message: string;
  } | null>(null);

  const [isCheckingFolder, setIsCheckingFolder] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  useEffect(() => {
    setServerName(config.serverName);
    setCyberpanelUrl(config.cyberpanelUrl);
    setCyberpanelUsername(config.cyberpanelUsername);
    setBackupMode(config.backupMode);
    setDomains(config.domains);
    setDomainPaths(config.domainPaths || {});
    setIncludeFiles(config.includeFiles);
    setIncludeDatabases(config.includeDatabases);
    setIncludeEmails(config.includeEmails);
    setIncludeSslDns(config.includeSslDns);
    setExcludeHeavyDeps(config.excludeHeavyDeps ?? true);
    setDriveFolderName(config.driveFolderName);
    setDriveFolderId(config.driveFolderId);
    setCompressionFormat(config.compressionFormat);
  }, [config]);

  const handleAddDomain = () => {
    const clean = newDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!clean) return;
    if (domains.includes(clean)) {
      setNewDomain('');
      return;
    }
    if (domains.length >= 100) {
      setErrorMsg('Maksimal 100 domain per profil konfigurasi.');
      return;
    }
    const cleanPath = newDomainPath.trim() || `/home/${clean}/public_html`;
    setDomains((prev) => [...prev, clean]);
    setDomainPaths((prev) => ({ ...prev, [clean]: cleanPath }));
    setNewDomain('');
    setNewDomainPath('');
  };

  const handleRemoveDomain = (domainToRemove: string) => {
    setDomains((prev) => prev.filter((d) => d !== domainToRemove));
    setDomainPaths((prev) => {
      const next = { ...prev };
      delete next[domainToRemove];
      return next;
    });
  };

  const handleSyncFromServer = async () => {
    setErrorMsg(null);
    const merged = await onSyncWebsites();
    if (merged.length > 0) {
      setDomains(merged);
    }
  };

  const handleProbe = async () => {
    setIsProbing(true);
    setProbeResult(null);
    setErrorMsg(null);
    try {
      const res = await onProbeEndpoint(cyberpanelUrl);
      setProbeResult({ reachable: res.reachable, message: res.message });
    } catch (err) {
      setProbeResult({
        reachable: false,
        message: err instanceof Error ? err.message : 'Gagal menguji endpoint CyberPanel.',
      });
    } finally {
      setIsProbing(false);
    }
  };

  const handleVerifyFolder = async () => {
    setIsCheckingFolder(true);
    setErrorMsg(null);
    try {
      const folder = await onVerifyDriveFolder(driveFolderName);
      setDriveFolderName(folder.name);
      setDriveFolderId(folder.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memverifikasi folder Google Drive.');
    } finally {
      setIsCheckingFolder(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSavedNotice(false);
    setErrorMsg(null);
    try {
      await onSaveConfig({
        serverName: serverName.trim() || 'CyberPanel Server',
        cyberpanelUrl: cyberpanelUrl.trim(),
        cyberpanelUsername: cyberpanelUsername.trim() || 'admin',
        backupMode,
        domains,
        domainPaths,
        includeFiles,
        includeDatabases,
        includeEmails,
        includeSslDns,
        excludeHeavyDeps,
        driveFolderName: driveFolderName.trim() || 'CyberPanel-Backups',
        driveFolderId: driveFolderId.trim(),
        compressionFormat,
        retentionCount: schedule.maxRetentionFiles || 14,
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi server.');
    } finally {
      setIsSaving(false);
    }
  };

  const draftConfig: BackupConfig = {
    ...config,
    serverName,
    cyberpanelUrl,
    cyberpanelUsername,
    backupMode,
    domains,
    domainPaths,
    includeFiles,
    includeDatabases,
    includeEmails,
    includeSslDns,
    excludeHeavyDeps,
    driveFolderName,
    driveFolderId,
    compressionFormat,
  };

  const bashScript = generateRcloneScript(draftConfig, schedule);

  const handleCopyScript = async () => {
    await navigator.clipboard.writeText(bashScript);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const handleDownloadScript = () => {
    const blob = new Blob([bashScript], { type: 'text/x-shellscript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cyberpanel-gdrive-backup.sh';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden transition-colors"
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Konfigurasi Server CyberPanel &amp; Target Backup
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Tentukan alamat panel CyberPanel, daftar website target, path proyek Laravel kustom, komponen arsip, dan folder tujuan di Google Drive.
          </p>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="serverName"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Label / Nama Server
              </label>
              <input
                id="serverName"
                type="text"
                required
                maxLength={100}
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                placeholder="Server Produksi SMKN 1 Temon"
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/15"
              />
            </div>

            <div>
              <label
                htmlFor="cyberpanelUsername"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Username Admin CyberPanel
              </label>
              <input
                id="cyberpanelUsername"
                type="text"
                maxLength={64}
                value={cyberpanelUsername}
                onChange={(e) => setCyberpanelUsername(e.target.value)}
                placeholder="admin"
                className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/15"
              />
            </div>
          </div>

          {/* CyberPanel Endpoint URL + Probe */}
          <div>
            <label
              htmlFor="cyberpanelUrl"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              URL Endpoint CyberPanel (Port 8090)
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                id="cyberpanelUrl"
                type="url"
                maxLength={256}
                value={cyberpanelUrl}
                onChange={(e) => setCyberpanelUrl(e.target.value)}
                placeholder="https://panel.domainanda.sch.id:8090"
                className="flex-1 px-3.5 py-2.5 text-sm font-mono bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/15"
              />
              <button
                type="button"
                onClick={handleProbe}
                disabled={isProbing || !cyberpanelUrl.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Activity className="w-4 h-4 text-[#1d63ed] dark:text-blue-400" />
                {isProbing ? 'Menguji...' : 'Uji Koneksi'}
              </button>
            </div>
            {probeResult && (
              <p
                className={`mt-2 text-xs ${
                  probeResult.reachable
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {probeResult.message}
              </p>
            )}
          </div>

          {/* Target Domains + CyberPanel Auto-Discovery */}
          <div className="pt-5 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Daftar Website / Domain CyberPanel ({domains.length}/100)
              </label>
              <button
                type="button"
                onClick={() => void handleSyncFromServer()}
                disabled={isSyncingWebsites}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0c45b6] dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingWebsites ? 'animate-spin' : ''}`} />
                {isSyncingWebsites ? 'Memindai Server...' : 'Ambil Daftar Website dari CyberPanel'}
              </button>
            </div>

            {syncStatusMsg && (
              <p className="mb-3 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
                {syncStatusMsg}
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-3">
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddDomain();
                  }
                }}
                placeholder="Domain (mis: ppdb.smkn1temon.sch.id)"
                className="md:col-span-5 px-3.5 py-2 text-sm font-mono bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed]"
              />
              <input
                type="text"
                value={newDomainPath}
                onChange={(e) => setNewDomainPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddDomain();
                  }
                }}
                placeholder="Path proyek (opsional, mis: /home/ppdb.../laravel)"
                className="md:col-span-5 px-3.5 py-2 text-sm font-mono bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed]"
              />
              <button
                type="button"
                onClick={handleAddDomain}
                className="md:col-span-2 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Tambah
              </button>
            </div>

            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Untuk website <strong>Laravel</strong> di luar{' '}
              <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">
                public_html
              </code>{' '}
              (mis.{' '}
              <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">
                /home/domain/app
              </code>{' '}
              atau{' '}
              <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">
                /var/www/laravel
              </code>
              ), masukkan folder root proyek agar{' '}
              <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">.env</code>,{' '}
              <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">app/</code>,{' '}
              <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">storage/</code>, dan{' '}
              <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">public/</code> ikut ter-backup.
            </p>

            {domains.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Belum ada domain terdaftar. Tambahkan minimal satu domain untuk disertakan dalam arsip backup.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl max-h-72 overflow-y-auto">
                {domains.map((domain) => (
                  <div
                    key={domain}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 sm:w-56 shrink-0 truncate">
                      {domain}
                    </span>
                    <input
                      type="text"
                      aria-label={`Path direktori proyek untuk ${domain}`}
                      value={domainPaths[domain] ?? `/home/${domain}/public_html`}
                      onChange={(e) =>
                        setDomainPaths((prev) => ({
                          ...prev,
                          [domain]: e.target.value,
                        }))
                      }
                      placeholder={`/home/${domain}/public_html`}
                      className="flex-1 px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:border-[#1d63ed]"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveDomain(domain)}
                      className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-1 rounded-lg cursor-pointer self-end sm:self-center"
                      aria-label={`Hapus domain ${domain}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Backup Components */}
          <div className="pt-5 border-t border-slate-200 dark:border-slate-800">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">
              Komponen Data Backup
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  label: 'File Website & Laravel',
                  checked: includeFiles,
                  onChange: setIncludeFiles,
                },
                {
                  label: 'Database MariaDB/MySQL',
                  checked: includeDatabases,
                  onChange: setIncludeDatabases,
                },
                {
                  label: 'Akun Email & Maildir',
                  checked: includeEmails,
                  onChange: setIncludeEmails,
                },
                {
                  label: 'Sertifikat SSL & Zona DNS',
                  checked: includeSslDns,
                  onChange: setIncludeSslDns,
                },
              ].map((item) => (
                <label
                  key={item.label}
                  className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/50 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => item.onChange(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[#1d63ed]"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>

            <label className="mt-3 flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/50 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800">
              <input
                type="checkbox"
                checked={excludeHeavyDeps}
                onChange={(e) => setExcludeHeavyDeps(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[#1d63ed]"
              />
              <span>
                Kecualikan folder <code className="font-mono">vendor/</code> &amp;{' '}
                <code className="font-mono">node_modules/</code> saat mengarsipkan proyek Laravel kustom (lebih cepat &amp; hemat kuota Drive)
              </span>
            </label>
          </div>

          {/* Google Drive Destination Folder & Compression */}
          <div className="pt-5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-2">
              <label
                htmlFor="driveFolderName"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Nama Folder Tujuan di Google Drive
              </label>
              <div className="flex gap-2">
                <input
                  id="driveFolderName"
                  type="text"
                  required
                  maxLength={100}
                  value={driveFolderName}
                  onChange={(e) => {
                    setDriveFolderName(e.target.value);
                    setDriveFolderId('');
                  }}
                  placeholder="CyberPanel-Backups"
                  className="flex-1 px-3.5 py-2.5 text-sm bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed]"
                />
                <button
                  type="button"
                  onClick={handleVerifyFolder}
                  disabled={isCheckingFolder || !driveFolderName.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FolderPlus className="w-4 h-4 text-[#1d63ed] dark:text-blue-400" />
                  {isCheckingFolder ? 'Menyiapkan...' : 'Siapkan Folder Drive'}
                </button>
              </div>
              {driveFolderId && (
                <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-mono">
                  Folder terhubung · ID: {driveFolderId}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="compressionFormat"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Format Kompresi Arsip
              </label>
              <select
                id="compressionFormat"
                value={compressionFormat}
                onChange={(e) => setCompressionFormat(e.target.value as 'tar.gz' | 'tar.zst')}
                className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed]"
              >
                <option value="tar.gz">tar.gz (Gzip Standar)</option>
                <option value="tar.zst">tar.zst (Zstandard)</option>
              </select>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-4 pt-2">
            {savedNotice && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <Check className="w-4 h-4" />
                Konfigurasi server tersimpan permanen
              </span>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-[#1d63ed] to-[#0c45b6] hover:from-[#1755d1] hover:to-[#0a3a99] disabled:opacity-60 rounded-xl shadow-xs transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Menyimpan...' : 'Simpan Konfigurasi Server'}
            </button>
          </div>
        </div>
      </form>

      {/* CyberPanel CLI + rclone Script Generator */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden transition-colors">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Script Agent Server CyberPanel CLI &amp; rclone
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pasang script ini di server Linux CyberPanel Anda untuk sinkronisasi penuh direktori /home/backup dan path Laravel kustom ke folder Google Drive yang sama.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyScript}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedScript ? 'Tersalin' : 'Salin Script'}
            </button>
            <button
              type="button"
              onClick={handleDownloadScript}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-[#1d63ed] hover:bg-slate-800 dark:hover:bg-[#1755d1] rounded-xl transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh .sh
            </button>
          </div>
        </div>

        <pre className="p-5 bg-[#0B1120] text-slate-200 font-mono text-xs leading-relaxed overflow-x-auto">
          {bashScript}
        </pre>
      </section>
    </div>
  );
}
