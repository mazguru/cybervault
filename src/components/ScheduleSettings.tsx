import { useEffect, useState } from 'react';
import { CalendarClock, Check, Save } from 'lucide-react';
import {
  buildCronExpression,
  computeNextRunText,
  formatScheduleSummary,
} from '../lib/format';
import type { BackupFrequency, BackupSchedule, ServerTimezone } from '../types/backup';

interface ScheduleSettingsProps {
  schedule: BackupSchedule;
  onSaveSchedule: (updated: Omit<BackupSchedule, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}

const FREQUENCY_OPTIONS: Array<{ value: BackupFrequency; label: string }> = [
  { value: 'daily', label: 'Harian' },
  { value: 'weekly', label: 'Mingguan' },
  { value: 'monthly', label: 'Bulanan' },
  { value: 'interval_12h', label: 'Per 12 Jam' },
  { value: 'interval_6h', label: 'Per 6 Jam' },
];

const DAYS_OF_WEEK = [
  { value: 0, label: 'Minggu' },
  { value: 1, label: 'Senin' },
  { value: 2, label: 'Selasa' },
  { value: 3, label: 'Rabu' },
  { value: 4, label: 'Kamis' },
  { value: 5, label: 'Jumat' },
  { value: 6, label: 'Sabtu' },
];

export function ScheduleSettings({ schedule, onSaveSchedule }: ScheduleSettingsProps) {
  const [enabled, setEnabled] = useState(schedule.enabled);
  const [frequency, setFrequency] = useState<BackupFrequency>(schedule.frequency);
  const [timeOfDay, setTimeOfDay] = useState(schedule.timeOfDay);
  const [dayOfWeek, setDayOfWeek] = useState(schedule.dayOfWeek);
  const [dayOfMonth, setDayOfMonth] = useState(schedule.dayOfMonth);
  const [timezone, setTimezone] = useState<ServerTimezone>(schedule.timezone);
  const [autoPruneDrive, setAutoPruneDrive] = useState(schedule.autoPruneDrive);
  const [maxRetentionFiles, setMaxRetentionFiles] = useState(schedule.maxRetentionFiles);
  const [notifyEmail, setNotifyEmail] = useState(schedule.notifyEmail);

  const [isSaving, setIsSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(schedule.enabled);
    setFrequency(schedule.frequency);
    setTimeOfDay(schedule.timeOfDay);
    setDayOfWeek(schedule.dayOfWeek);
    setDayOfMonth(schedule.dayOfMonth);
    setTimezone(schedule.timezone);
    setAutoPruneDrive(schedule.autoPruneDrive);
    setMaxRetentionFiles(schedule.maxRetentionFiles);
    setNotifyEmail(schedule.notifyEmail);
  }, [schedule]);

  const draftSchedule: BackupSchedule = {
    ...schedule,
    enabled,
    frequency,
    timeOfDay,
    dayOfWeek,
    dayOfMonth,
    timezone,
    autoPruneDrive,
    maxRetentionFiles,
    notifyEmail,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);
    setSavedFeedback(false);
    try {
      await onSaveSchedule({
        enabled,
        frequency,
        timeOfDay,
        dayOfWeek,
        dayOfMonth,
        timezone,
        autoPruneDrive,
        maxRetentionFiles: Math.min(100, Math.max(1, Number(maxRetentionFiles) || 14)),
        notifyEmail: notifyEmail.trim(),
        lastTriggeredAt: schedule.lastTriggeredAt || '',
      });
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 3500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan jadwal.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden transition-colors">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Pengaturan Jadwal Backup Otomatis
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Semua perubahan jadwal disimpan permanen ke database VPS dan dijalankan 24/7 oleh scheduler server.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((prev) => !prev)}
            className={`inline-flex items-center gap-3 px-4 py-2 rounded-xl border text-sm font-medium transition-colors shrink-0 cursor-pointer ${
              enabled
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <span
              className={`w-8 h-4.5 rounded-full relative transition-colors ${
                enabled ? 'bg-emerald-600' : 'bg-slate-400 dark:bg-slate-600'
              }`}
            >
              <span
                className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                  enabled ? 'left-4' : 'left-0.5'
                }`}
              />
            </span>
            <span>{enabled ? 'Jadwal Aktif' : 'Jadwal Dijeda'}</span>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Frequency Segmented Control */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2.5">
              Frekuensi Eksekusi
            </label>
            <div className="inline-flex flex-wrap gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
              {FREQUENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFrequency(opt.value)}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    frequency === opt.value
                      ? 'bg-white dark:bg-slate-900 text-[#0c45b6] dark:text-white shadow-xs border border-slate-200/80 dark:border-slate-700'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Timing & Day Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label
                htmlFor="timeOfDay"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Waktu Eksekusi (24 Jam)
              </label>
              <input
                id="timeOfDay"
                type="time"
                required
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/15"
              />
            </div>

            {frequency === 'weekly' && (
              <div>
                <label
                  htmlFor="dayOfWeek"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Hari Eksekusi
                </label>
                <select
                  id="dayOfWeek"
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/15"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {frequency === 'monthly' && (
              <div>
                <label
                  htmlFor="dayOfMonth"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Tanggal Eksekusi (1–28)
                </label>
                <input
                  id="dayOfMonth"
                  type="number"
                  min={1}
                  max={28}
                  value={dayOfMonth}
                  onChange={(e) =>
                    setDayOfMonth(Math.min(28, Math.max(1, Number(e.target.value) || 1)))
                  }
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/15"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="timezone"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Zona Waktu Server
              </label>
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value as ServerTimezone)}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/15"
              >
                <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="notifyEmail"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Email Laporan Status
              </label>
              <input
                id="notifyEmail"
                type="email"
                placeholder="admin@domain.sch.id"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/15"
              />
            </div>
          </div>

          {/* Retention Policy */}
          <div className="pt-5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoPruneDrive}
                onChange={(e) => setAutoPruneDrive(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[#1d63ed] focus:ring-blue-500"
              />
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Pembersihan Arsip Lama Otomatis (Auto-Retention)
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Secara otomatis menghapus arsip backup terlama di folder Google Drive setelah melebihi batas penyimpanan.
                </div>
              </div>
            </label>

            <div>
              <label
                htmlFor="maxRetentionFiles"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Jumlah Maksimal Arsip Disimpan
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="maxRetentionFiles"
                  type="number"
                  min={1}
                  max={100}
                  value={maxRetentionFiles}
                  onChange={(e) =>
                    setMaxRetentionFiles(Math.min(100, Math.max(1, Number(e.target.value) || 1)))
                  }
                  className="w-28 px-3.5 py-2 text-sm font-mono tabular-nums bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed]"
                />
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  file arsip terbaru di Google Drive
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Untuk menghemat disk VPS, arsip CyberPanel lokal dihapus setelah berhasil diunggah ke Google Drive.
            Jika upload gagal atau arsip tidak dapat diunggah, file lokal tetap dipertahankan.
          </p>

          {/* Schedule Summary Preview */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <CalendarClock className="w-5 h-5 text-[#1d63ed] dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <div className="font-semibold text-slate-900 dark:text-white">
                  Ringkasan: {formatScheduleSummary(draftSchedule)}
                </div>
                <div className="text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                  Ekspresi Cron: {buildCronExpression(draftSchedule)} · Eksekusi berikutnya:{' '}
                  {computeNextRunText(draftSchedule)}
                </div>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-4 pt-2">
            {savedFeedback && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <Check className="w-4 h-4" />
                Jadwal otomatis tersimpan permanen
              </span>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-[#1d63ed] to-[#0c45b6] hover:from-[#1755d1] hover:to-[#0a3a99] disabled:opacity-60 rounded-xl shadow-xs transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Menyimpan...' : 'Simpan Jadwal Permanen'}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
