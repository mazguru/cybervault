import { useEffect, useRef } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  FolderOpen,
  Globe,
  HardDrive,
  Pencil,
  Play,
  RefreshCw,
  Terminal,
  Trash2,
} from 'lucide-react';
import {
  computeNextRunText,
  formatBytes,
  formatDateTimeId,
  formatScheduleSummary,
  formatTimeShort,
} from '../lib/format';
import type {
  ActiveView,
  BackupConfig,
  BackupLogEntry,
  BackupRun,
  BackupSchedule,
  DriveStorageQuota,
} from '../types/backup';

interface BackupConsoleProps {
  operatorName: string;
  config: BackupConfig;
  schedule: BackupSchedule;
  runs: BackupRun[];
  selectedDomains: string[];
  isSyncingWebsites: boolean;
  syncStatusMsg: string | null;
  driveFileCount: number;
  driveQuota: DriveStorageQuota | null;
  isBackingUp: boolean;
  progress: number;
  stageLabel: string;
  logs: BackupLogEntry[];
  onToggleDomain: (domain: string) => void;
  onToggleAllDomains: () => void;
  onSyncWebsites: () => void;
  onStartBackup: () => void;
  onClearLogs: () => void;
  onNavigate: (view: ActiveView) => void;
}

function getGreetingPrefix(): string {
  const hour = new Date().getHours();
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

export function BackupConsole({
  operatorName,
  config,
  schedule,
  runs,
  selectedDomains,
  isSyncingWebsites,
  syncStatusMsg,
  driveFileCount,
  driveQuota,
  isBackingUp,
  progress,
  stageLabel,
  logs,
  onToggleDomain,
  onToggleAllDomains,
  onSyncWebsites,
  onStartBackup,
  onClearLogs,
  onNavigate,
}: BackupConsoleProps) {
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopyLogs = async () => {
    const text = logs
      .map((l) => `[${formatTimeShort(l.timestamp)}] [${l.level}] ${l.message}`)
      .join('\n');
    if (text) {
      await navigator.clipboard.writeText(text);
    }
  };

  const quotaUsedText = driveQuota ? formatBytes(driveQuota.usage) : 'rclone';
  const quotaSubText = driveQuota
    ? driveQuota.limit > 0
      ? `dari ${formatBytes(driveQuota.limit)}`
      : 'Terpakai Drive'
    : 'Terpakai Drive';

  const activeScopeParts = [
    config.includeFiles ? 'File Website / Laravel' : null,
    config.includeDatabases ? 'MariaDB' : null,
    config.includeEmails ? 'Email' : null,
    config.includeSslDns ? 'SSL/DNS' : null,
  ].filter(Boolean);

  const scopeSummary =
    activeScopeParts.length > 0 ? activeScopeParts.join(' · ') : 'Manifest saja';

  const cleanHostLabel = config.cyberpanelUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const greetingPrefix = getGreetingPrefix();

  return (
    <div className="space-y-6">
      {/* Royal-Blue Hero Banner Card with 4 Glass Metric Tiles */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#1557d6] via-[#0e47b8] to-[#1a67e8] text-white p-6 sm:p-7 shadow-lg shadow-blue-900/10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full bg-white/10 blur-3xl"
        />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
          <div className="space-y-1.5 min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100/90">
              DATA CENTER · BACKUP CYBERPANEL
            </div>
            <p className="text-sm font-medium text-blue-100 pt-1">
              {greetingPrefix}, <span className="font-semibold text-white">{operatorName}</span>
            </p>
            <h2 className="text-2xl sm:text-[30px] font-bold tracking-tight text-white leading-tight">
              SMK Negeri 1 Temon
            </h2>
            <p className="text-xs sm:text-sm text-blue-100/85 truncate">
              {config.serverName} · Jadwal otomatis {schedule.enabled ? 'aktif 24/7' : 'dijeda'}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 xl:min-w-[500px] shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('config')}
              className="text-left bg-white/12 hover:bg-white/18 border border-white/20 rounded-xl px-4 py-3.5 backdrop-blur-xs transition-colors cursor-pointer"
            >
              <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-white leading-tight">
                {selectedDomains.length}/{config.domains.length}
              </div>
              <div className="text-xs text-blue-100/85 mt-1">Website Target</div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('drive')}
              className="text-left bg-white/12 hover:bg-white/18 border border-white/20 rounded-xl px-4 py-3.5 backdrop-blur-xs transition-colors cursor-pointer"
            >
              <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-white leading-tight">
                {driveFileCount}
              </div>
              <div className="text-xs text-blue-100/85 mt-1">Arsip Drive</div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('schedule')}
              className="text-left bg-white/12 hover:bg-white/18 border border-white/20 rounded-xl px-4 py-3.5 backdrop-blur-xs transition-colors cursor-pointer"
            >
              <div className="text-xl sm:text-2xl font-bold text-white leading-tight">
                {schedule.enabled ? 'Aktif' : 'Dijeda'}
              </div>
              <div className="text-xs text-blue-100/85 mt-1 font-mono tabular-nums">
                {schedule.enabled ? `${schedule.timeOfDay} WIB` : 'Jadwal Jeda'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('drive')}
              className="text-left bg-white/12 hover:bg-white/18 border border-white/20 rounded-xl px-4 py-3.5 backdrop-blur-xs transition-colors cursor-pointer"
            >
              <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-white leading-tight truncate">
                {quotaUsedText}
              </div>
              <div className="text-xs text-blue-100/85 mt-1 truncate">{quotaSubText}</div>
            </button>
          </div>
        </div>
      </section>

      {/* Unified Server Gateway & Backup Execution Card */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden transition-colors">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#1d63ed] dark:text-blue-400">
                  SERVER CYBERPANEL TARGET
                </span>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className="font-mono text-slate-500 dark:text-slate-400">
                  {config.cyberpanelUsername}
                </span>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span
                  className={`font-medium ${
                    schedule.enabled
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {selectedDomains.length} website dipilih
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-0.5">
                <span className="text-xl sm:text-2xl font-bold font-mono text-slate-900 dark:text-white tracking-tight truncate">
                  {cleanHostLabel || 'smkn1temon.sch.id:8090'}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('config')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Pencil className="w-3 h-3" />
                  Atur Target
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onStartBackup}
                disabled={isBackingUp || selectedDomains.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-[#1d63ed] to-[#0c45b6] hover:from-[#1755d1] hover:to-[#0a3a99] disabled:opacity-55 rounded-xl shadow-xs transition-all whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4 fill-current" />
                {isBackingUp ? `Memproses (${progress}%)` : 'Backup Sekarang'}
              </button>

              <button
                type="button"
                onClick={onSyncWebsites}
                disabled={isSyncingWebsites}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingWebsites ? 'animate-spin' : ''}`} />
                {isSyncingWebsites ? 'Menyinkronkan...' : 'Sinkronkan CyberPanel'}
              </button>

              <button
                type="button"
                onClick={() => onNavigate('schedule')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CalendarClock className="w-3.5 h-3.5 text-[#1d63ed] dark:text-blue-400" />
                Jadwal
              </button>

              <button
                type="button"
                onClick={() => onNavigate('drive')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <HardDrive className="w-3.5 h-3.5 text-[#1d63ed] dark:text-blue-400" />
                Drive
              </button>
            </div>
          </div>

          {/* Structured 5-Column Server & Policy Specs */}
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-3.5">
              Kebijakan &amp; Spesifikasi Backup
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-xs">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Mode
                </div>
                <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                  {config.backupMode === 'snapshot_and_drive'
                    ? 'Snapshot + Drive'
                    : 'API CyberPanel + Drive'}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Kompresi
                </div>
                <div className="mt-1 font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {config.compressionFormat}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Cakupan
                </div>
                <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {scopeSummary}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Folder Drive
                </div>
                <div className="mt-1 font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {config.driveFolderName}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Retensi &amp; Jadwal
                </div>
                <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100 tabular-nums truncate">
                  Maks {schedule.maxRetentionFiles} ·{' '}
                  {schedule.enabled ? computeNextRunText(schedule) : formatScheduleSummary(schedule)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-4 bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-medium text-slate-700 dark:text-slate-300">{stageLabel}</span>
            <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
              {progress}%
            </span>
          </div>
          <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ease-out rounded-full ${
                progress === 100
                  ? 'bg-emerald-600'
                  : isBackingUp
                    ? 'bg-[#1d63ed]'
                    : 'bg-slate-400 dark:bg-slate-600'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
        </div>

        {/* Real-Time Terminal Log Viewport */}
        <div className="bg-[#0B1120] text-slate-200">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5 text-xs font-medium text-slate-300">
              <Terminal className="w-4 h-4 text-blue-400" />
              <span>Log Proses Real-Time</span>
              {isBackingUp && (
                <span className="text-blue-400 font-mono">· Streaming aktif</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyLogs}
                disabled={logs.length === 0}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Salin
              </button>
              <button
                type="button"
                onClick={onClearLogs}
                disabled={logs.length === 0 || isBackingUp}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Bersihkan
              </button>
            </div>
          </div>

          <div
            ref={logContainerRef}
            className="h-64 overflow-y-auto p-5 font-mono text-[12.5px] leading-relaxed space-y-1.5"
          >
            {logs.length === 0 ? (
              <div className="text-slate-500">
                Siap menjalankan backup. Klik tombol &ldquo;Backup Sekarang&rdquo; untuk memulai pengemasan arsip CyberPanel &amp; Laravel dan mengunggahnya ke Google Drive secara real-time.
              </div>
            ) : (
              logs.map((entry) => {
                const levelColor =
                  entry.level === 'OK'
                    ? 'text-emerald-400'
                    : entry.level === 'WARN'
                      ? 'text-amber-400'
                      : entry.level === 'ERROR'
                        ? 'text-red-400'
                        : 'text-sky-400';

                return (
                  <div key={entry.id} className="flex items-start gap-3">
                    <span className="text-slate-500 shrink-0 tabular-nums">
                      {formatTimeShort(entry.timestamp)}
                    </span>
                    <span className={`shrink-0 font-semibold w-12 ${levelColor}`}>
                      [{entry.level}]
                    </span>
                    <span className="text-slate-200 break-words">{entry.message}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* Daftar Website yang Di-Backup */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden transition-colors">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 flex items-center justify-center shrink-0 mt-0.5">
              <Globe className="w-4 h-4 text-[#1d63ed] dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Daftar Website yang Di-Backup ({selectedDomains.length}/{config.domains.length})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Centang website CyberPanel atau proyek Laravel kustom yang disertakan pada eksekusi backup.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onSyncWebsites}
              disabled={isSyncingWebsites}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingWebsites ? 'animate-spin' : ''}`} />
              {isSyncingWebsites ? 'Menyinkronkan...' : 'Sinkronkan CyberPanel'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('config')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0c45b6] dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Kelola Daftar
            </button>
          </div>
        </div>

        {syncStatusMsg && (
          <div className="px-6 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
            {syncStatusMsg}
          </div>
        )}

        {config.domains.length === 0 ? (
          <div className="p-10 text-center">
            <Globe className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Belum ada website terdaftar untuk di-backup
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Klik &ldquo;Sinkronkan CyberPanel&rdquo; saat berjalan di server CyberPanel atau tambahkan domain di Konfigurasi Server.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <th className="py-3 pl-6 pr-2 w-10">
                    <input
                      type="checkbox"
                      aria-label="Pilih semua website"
                      checked={
                        config.domains.length > 0 &&
                        selectedDomains.length === config.domains.length
                      }
                      onChange={onToggleAllDomains}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[#1d63ed]"
                    />
                  </th>
                  <th className="py-3 px-4">Domain Website</th>
                  <th className="py-3 px-4">Direktori Proyek / DocRoot</th>
                  <th className="py-3 px-4">Cakupan Data</th>
                  <th className="py-3 px-6 text-right">Status Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {config.domains.map((domain) => {
                  const isSelected = selectedDomains.includes(domain);
                  const customPath = config.domainPaths?.[domain];
                  const isCustomRoot =
                    Boolean(customPath) && customPath !== `/home/${domain}/public_html`;
                  return (
                    <tr
                      key={domain}
                      onClick={() => onToggleDomain(domain)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50/40 dark:bg-blue-950/25'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3.5 pl-6 pr-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Sertakan ${domain}`}
                          checked={isSelected}
                          onChange={() => onToggleDomain(domain)}
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[#1d63ed]"
                        />
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {domain}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                        <div>{customPath || `/home/${domain}/public_html`}</div>
                        {isCustomRoot && (
                          <div className="text-[11px] font-sans text-[#1d63ed] dark:text-blue-400 mt-0.5">
                            Path kustom / Laravel
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                        {scopeSummary}
                      </td>
                      <td className="py-3.5 px-6 text-right whitespace-nowrap">
                        <span
                          className={`text-xs font-medium ${
                            isSelected
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {isSelected ? 'Disertakan' : 'Dilewati'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent Runs History */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden transition-colors">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Riwayat Eksekusi Backup
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Catatan permanen aktivitas backup manual dan terjadwal di server VPS
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('drive')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1d63ed] dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderOpen className="w-4 h-4" />
            Lihat File di Google Drive
          </button>
        </div>

        {runs.length === 0 ? (
          <div className="p-10 text-center">
            <Database className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Belum ada riwayat eksekusi backup
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Jalankan backup pertama Anda dengan menekan tombol &ldquo;Backup Sekarang&rdquo; di atas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <th className="py-3 px-6">Waktu</th>
                  <th className="py-3 px-4">Nama Arsip</th>
                  <th className="py-3 px-4">Pemicu</th>
                  <th className="py-3 px-4 text-right">Ukuran</th>
                  <th className="py-3 px-4 text-right">Durasi</th>
                  <th className="py-3 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-6 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums whitespace-nowrap">
                      {formatDateTimeId(run.createdAt)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100 font-mono text-xs truncate max-w-xs">
                        {run.archiveName || run.serverName}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">
                        {run.summaryMessage}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                      {run.triggerType === 'scheduled' ? 'Otomatis' : 'Manual'}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-700 dark:text-slate-300 font-mono tabular-nums text-right whitespace-nowrap">
                      {formatBytes(run.archiveSizeBytes)}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums text-right whitespace-nowrap">
                      {run.durationMs > 0 ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td className="py-3.5 px-6 whitespace-nowrap">
                      {run.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                          Berhasil
                        </span>
                      ) : run.status === 'failed' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
                          <AlertCircle className="w-4 h-4" />
                          Gagal
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                          <Clock className="w-4 h-4" />
                          Proses
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
