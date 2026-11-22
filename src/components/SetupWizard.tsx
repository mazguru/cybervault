import { useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FolderCheck,
  Globe,
  Link2,
  RefreshCw,
  Server,
  Terminal,
  X,
} from 'lucide-react';
import { formatScheduleSummary } from '../lib/format';
import type { ActiveView, BackupConfig, BackupSchedule } from '../types/backup';

interface SetupWizardProps {
  isOpen: boolean;
  operatorLabel: string;
  config: BackupConfig;
  schedule: BackupSchedule;
  isCyberPanelHost: boolean;
  rcloneConfigured: boolean;
  hasDriveOAuth: boolean;
  canConnectGoogleDrive: boolean;
  isSyncingWebsites: boolean;
  syncStatusMsg: string | null;
  onSyncWebsites: () => Promise<string[]>;
  onConnectGoogleDrive: () => Promise<void>;
  onVerifyDriveFolder: (folderName: string) => Promise<{ id: string; name: string }>;
  onSaveFolderToConfig: (folderName: string, folderId: string) => Promise<void>;
  onNavigate: (view: ActiveView) => void;
  onComplete: () => void;
}

export function SetupWizard({
  isOpen,
  operatorLabel,
  config,
  schedule,
  isCyberPanelHost,
  rcloneConfigured,
  hasDriveOAuth,
  canConnectGoogleDrive,
  isSyncingWebsites,
  syncStatusMsg,
  onSyncWebsites,
  onConnectGoogleDrive,
  onVerifyDriveFolder,
  onSaveFolderToConfig,
  onNavigate,
  onComplete,
}: SetupWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [folderInput, setFolderInput] = useState(config.driveFolderName || 'CyberPanel-Backups');
  const [isVerifyingFolder, setIsVerifyingFolder] = useState(false);
  const [folderFeedback, setFolderFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const hasWebsites = config.domains.length > 0;
  const driveReady = hasDriveOAuth || rcloneConfigured;

  const handlePrepareFolder = async () => {
    setIsVerifyingFolder(true);
    setFolderFeedback(null);
    try {
      if (!hasDriveOAuth) {
        await onConnectGoogleDrive();
      }
      const folder = await onVerifyDriveFolder(folderInput);
      await onSaveFolderToConfig(folder.name, folder.id);
      setFolderFeedback(`Folder "${folder.name}" siap di Google Drive (ID: ${folder.id}).`);
    } catch (err) {
      setFolderFeedback(
        err instanceof Error ? err.message : 'Gagal menyiapkan folder Google Drive.'
      );
    } finally {
      setIsVerifyingFolder(false);
    }
  };

  const steps = [
    { num: 1 as const, title: 'Website CyberPanel', done: hasWebsites },
    { num: 2 as const, title: 'Koneksi Google Drive', done: driveReady },
    { num: 3 as const, title: 'Jadwal Otomatis 24/7', done: schedule.enabled },
    { num: 4 as const, title: 'Pemasangan di VPS', done: isCyberPanelHost },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-wizard-title"
      className="fixed inset-0 z-50 bg-slate-950/65 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
          <div>
            <h2 id="setup-wizard-title" className="text-lg font-bold text-slate-900 dark:text-white">
              Setup Awal Panel Backup CyberPanel (Mode Mandiri)
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Masuk sebagai <strong className="text-slate-900 dark:text-white">{operatorLabel}</strong>. Ikuti 4 langkah ringkas berikut agar website CyberPanel, proyek Laravel, Google Drive, dan scheduler VPS berjalan optimal.
            </p>
          </div>
          <button
            type="button"
            onClick={onComplete}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
            aria-label="Tutup setup awal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
          {steps.map((s) => {
            const active = step === s.num;
            return (
              <button
                key={s.num}
                type="button"
                onClick={() => setStep(s.num)}
                className={`px-4 py-3 text-left border-b-2 transition-colors cursor-pointer ${
                  active
                    ? 'border-[#1d63ed] bg-white dark:bg-slate-900'
                    : 'border-transparent hover:bg-slate-100/70 dark:hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-semibold">
                  <span className={active ? 'text-[#1d63ed] dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}>
                    Langkah {s.num}
                  </span>
                  {s.done && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                </div>
                <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5 truncate">
                  {s.title}
                </div>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Globe className="w-5 h-5 text-[#1d63ed] dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    1. Sinkronkan Daftar Website CyberPanel
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    {isCyberPanelHost
                      ? 'Server CyberPanel lokal terdeteksi. Klik tombol di bawah untuk mengambil seluruh domain dan path docRoot (termasuk Laravel kustom) secara otomatis.'
                      : 'Saat dipasang di VPS CyberPanel (smkn1temon.sch.id), klik "Ambil dari CyberPanel" untuk mendeteksi domain otomatis, atau atur daftar domain dan path proyek Laravel secara manual.'}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Website Terdaftar ({config.domains.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void onSyncWebsites()}
                      disabled={isSyncingWebsites}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0c45b6] dark:text-blue-300 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-900/60 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isSyncingWebsites ? 'animate-spin' : ''}`}
                      />
                      {isSyncingWebsites ? 'Memindai...' : 'Ambil dari CyberPanel'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onComplete();
                        onNavigate('config');
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                    >
                      Edit Manual
                    </button>
                  </div>
                </div>

                {syncStatusMsg && (
                  <p className="text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                    {syncStatusMsg}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {config.domains.length === 0 ? (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Belum ada domain terdaftar.
                    </span>
                  ) : (
                    config.domains.map((d) => (
                      <span
                        key={d}
                        className="font-mono text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg"
                      >
                        {d}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <FolderCheck className="w-5 h-5 text-[#1d63ed] dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    2. Koneksi Google Drive (OAuth atau rclone VPS)
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Panel ini mendukung dua cara koneksi Google Drive: langsung dari browser melalui <strong>OAuth Google Drive</strong> maupun melalui <strong>rclone</strong> di server VPS untuk backup otomatis 24/7.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Status OAuth Browser</span>
                  <span
                    className={`font-semibold ${
                      hasDriveOAuth
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {hasDriveOAuth ? 'Terhubung' : 'Belum terhubung'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Status rclone VPS</span>
                  <span
                    className={`font-semibold ${
                      rcloneConfigured
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {rcloneConfigured ? 'Aktif (siap cron 24/7)' : 'Belum terpasang di server ini'}
                  </span>
                </div>

                {!hasDriveOAuth && canConnectGoogleDrive && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => void onConnectGoogleDrive()}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-[#1d63ed] to-[#0c45b6] hover:from-[#1755d1] hover:to-[#0a3a99] rounded-xl cursor-pointer"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Hubungkan Akun Google Drive Sekarang
                    </button>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
                  <label
                    htmlFor="wizardFolder"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Nama Folder Tujuan di Google Drive
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="wizardFolder"
                      type="text"
                      value={folderInput}
                      onChange={(e) => setFolderInput(e.target.value)}
                      className="flex-1 px-3.5 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:border-[#1d63ed]"
                    />
                    <button
                      type="button"
                      onClick={() => void handlePrepareFolder()}
                      disabled={isVerifyingFolder || !folderInput.trim() || (!hasDriveOAuth && !canConnectGoogleDrive)}
                      className="px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isVerifyingFolder ? 'Menyiapkan...' : 'Siapkan Folder Drive'}
                    </button>
                  </div>
                  {folderFeedback && (
                    <p className="text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                      {folderFeedback}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CalendarClock className="w-5 h-5 text-[#1d63ed] dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    3. Scheduler Otomatis 24/7 di Server VPS
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Jadwal otomatis berjalan langsung di proses backend server VPS dan tersimpan permanen di file database lokal (<code className="font-mono">data/cybervault-db.json</code>), sehingga tetap mengeksekusi backup meski browser ditutup.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Status Jadwal</span>
                  <span
                    className={`font-semibold ${
                      schedule.enabled
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {schedule.enabled ? 'Aktif' : 'Dijeda'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Pola Eksekusi</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatScheduleSummary(schedule)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Retensi Google Drive</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    Maks {schedule.maxRetentionFiles} arsip terbaru
                  </span>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onComplete();
                      onNavigate('schedule');
                    }}
                    className="text-xs font-semibold text-[#1d63ed] dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Buka Halaman Pengaturan Jadwal Lengkap &rarr;
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Server className="w-5 h-5 text-[#1d63ed] dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    4. Checklist Pemasangan Mandiri di VPS CyberPanel
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Anda dapat memasang hasil pre-build dari branch <span className="font-mono">production</span> langsung di VPS <span className="font-mono">smkn1temon.sch.id</span> (detail lengkap ada di <span className="font-mono">docs/PANDUAN_CYBERPANEL.md</span>):
                  </p>
                </div>
              </div>

              <ol className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 list-decimal list-inside leading-relaxed">
                <li>
                  <strong>Zero-Install Build dari Branch Production</strong>: Pull dari GitHub branch{' '}
                  <code className="font-mono bg-white dark:bg-slate-900 px-1.5 py-0.5 border border-slate-200 dark:border-slate-700 rounded">
                    production
                  </code>{' '}
                  lalu jalankan <code className="font-mono">node dist/server.cjs</code> via <code className="font-mono">systemd</code> di port <code className="font-mono">3000</code>.
                </li>
                <li>
                  <strong>Reverse Proxy OpenLiteSpeed</strong>: Di CyberPanel &rarr; <em>Websites &rarr; Manage &rarr; vHost Conf</em>, pasang proxy ke <code className="font-mono">127.0.0.1:3000</code> + SSL Let&apos;s Encrypt.
                </li>
                <li>
                  <strong>Opsi Google Drive OAuth (Opsional)</strong>: Jika ingin tombol <em>Sign in with Google Drive</em> aktif di domain sekolah, tambahkan <code className="font-mono">https://backup.smkn1temon.sch.id</code> di Google Cloud OAuth Client.
                </li>
                <li>
                  <strong>Pasang <code className="font-mono">rclone</code> Remote <code className="font-mono">gdrive</code></strong>: Agar scheduler otomatis malam hari dapat mengunggah arsip penuh CyberPanel &amp; Laravel ke Google Drive tanpa browser terbuka.
                </li>
              </ol>

              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <Terminal className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  Status host saat ini:{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {isCyberPanelHost
                      ? 'Berjalan di Server CyberPanel Lokal'
                      : 'Berjalan di Lingkungan Preview / Eksternal'}
                  </strong>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onComplete}
            className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
          >
            Lewati &amp; Masuk Panel
          </button>

          <div className="flex items-center gap-2.5">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((prev) => (prev - 1) as 1 | 2 | 3 | 4)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl cursor-pointer"
              >
                Sebelumnya
              </button>
            )}
            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((prev) => (prev + 1) as 1 | 2 | 3 | 4)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-[#1d63ed] to-[#0c45b6] hover:from-[#1755d1] hover:to-[#0a3a99] rounded-xl cursor-pointer"
              >
                Lanjut
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onComplete}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Selesai &amp; Mulai Backup
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
