import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  FolderOpen,
  HardDrive,
  Link2,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { formatBytes, formatDateTimeId } from '../lib/format';
import type { DriveFileItem, DriveStorageQuota } from '../types/backup';

interface DriveFileManagerProps {
  files: DriveFileItem[];
  quota: DriveStorageQuota | null;
  folderName: string;
  scope: 'folder' | 'all_backups';
  driveSourceMode: 'oauth' | 'rclone' | 'disconnected';
  canConnectGoogleDrive: boolean;
  isLoading: boolean;
  errorMsg: string | null;
  onConnectGoogleDrive: () => Promise<void>;
  onChangeScope: (scope: 'folder' | 'all_backups') => void;
  onRefresh: () => void;
  onDownloadFile: (file: DriveFileItem) => Promise<void>;
  onDeleteFiles: (files: DriveFileItem[]) => Promise<void>;
}

type SortKey = 'newest' | 'oldest' | 'largest' | 'smallest';

export function DriveFileManager({
  files,
  quota,
  folderName,
  scope,
  driveSourceMode,
  canConnectGoogleDrive,
  isLoading,
  errorMsg,
  onConnectGoogleDrive,
  onChangeScope,
  onRefresh,
  onDownloadFile,
  onDeleteFiles,
}: DriveFileManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('newest');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDeleteFiles, setPendingDeleteFiles] = useState<DriveFileItem[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matched = q
      ? files.filter((f) => f.name.toLowerCase().includes(q))
      : files;

    return [...matched].sort((a, b) => {
      if (sortBy === 'largest') return b.size - a.size;
      if (sortBy === 'smallest') return a.size - b.size;
      const ta = new Date(a.createdTime || a.modifiedTime || 0).getTime();
      const tb = new Date(b.createdTime || b.modifiedTime || 0).getTime();
      return sortBy === 'oldest' ? ta - tb : tb - ta;
    });
  }, [files, searchQuery, sortBy]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredFiles.length && filteredFiles.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredFiles.map((f) => f.id));
    }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteFiles || pendingDeleteFiles.length === 0) return;
    setIsDeleting(true);
    try {
      await onDeleteFiles(pendingDeleteFiles);
      const deletedSet = new Set(pendingDeleteFiles.map((f) => f.id));
      setSelectedIds((prev) => prev.filter((id) => !deletedSet.has(id)));
      setPendingDeleteFiles(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async (file: DriveFileItem) => {
    setDownloadingId(file.id);
    try {
      await onDownloadFile(file);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await onConnectGoogleDrive();
    } finally {
      setIsConnecting(false);
    }
  };

  const quotaPct =
    quota && quota.limit > 0
      ? Math.min(100, Math.round((quota.usage / quota.limit) * 100))
      : 0;

  const totalDisplayedBytes = filteredFiles.reduce((acc, f) => acc + f.size, 0);

  if (driveSourceMode === 'disconnected') {
    return (
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-8 sm:p-10 text-center space-y-4 transition-colors">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 flex items-center justify-center mx-auto">
          <HardDrive className="w-6 h-6 text-[#1d63ed] dark:text-blue-400" />
        </div>
        <div className="max-w-lg mx-auto space-y-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Hubungkan Google Drive untuk Mengelola File Backup
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Anda masuk menggunakan <strong>Login Lokal</strong>. Hubungkan akun Google Drive Anda (atau konfigurasikan{' '}
            <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
              rclone
            </code>{' '}
            di VPS) untuk melihat daftar file backup, ukuran file, waktu upload, serta menghapus arsip langsung dari UI.
          </p>
        </div>

        {errorMsg && (
          <div className="max-w-md mx-auto p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={isConnecting || !canConnectGoogleDrive}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-[#1d63ed] to-[#0c45b6] hover:from-[#1755d1] hover:to-[#0a3a99] disabled:opacity-60 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Link2 className="w-4 h-4" />
            {isConnecting ? 'Menghubungkan...' : 'Hubungkan Akun Google Drive'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Storage Quota Summary */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-6 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 flex items-center justify-center shrink-0 mt-0.5">
              <HardDrive className="w-4 h-4 text-[#1d63ed] dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Manajemen File Backup Google Drive
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                {driveSourceMode === 'rclone'
                  ? `Terhubung melalui rclone VPS · Total daftar saat ini: ${formatBytes(totalDisplayedBytes)}`
                  : quota
                    ? `Terpakai ${formatBytes(quota.usage)} dari ${quota.limit > 0 ? formatBytes(quota.limit) : 'Tak Terbatas'} (${quotaPct}%) · Total daftar saat ini: ${formatBytes(totalDisplayedBytes)}`
                    : 'Memuat informasi kuota Google Drive...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {driveSourceMode === 'rclone' && canConnectGoogleDrive && (
              <button
                type="button"
                onClick={() => void handleConnect()}
                disabled={isConnecting}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0c45b6] dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-xl transition-colors cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
                Hubungkan OAuth Browser
              </button>
            )}
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Segarkan Daftar
            </button>
          </div>
        </div>

        {quota && quota.limit > 0 && (
          <div className="mt-4 w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                quotaPct >= 90 ? 'bg-red-600' : quotaPct >= 75 ? 'bg-amber-600' : 'bg-[#1d63ed]'
              }`}
              style={{ width: `${quotaPct}%` }}
            />
          </div>
        )}
      </section>

      {/* Filter & Data Table */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden transition-colors">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {driveSourceMode === 'oauth' && (
              <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => onChangeScope('folder')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    scope === 'folder'
                      ? 'bg-white dark:bg-slate-900 text-[#0c45b6] dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Folder: {folderName}
                </button>
                <button
                  type="button"
                  onClick={() => onChangeScope('all_backups')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    scope === 'all_backups'
                      ? 'bg-white dark:bg-slate-900 text-[#0c45b6] dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Semua Arsip Backup Drive
                </button>
              </div>
            )}

            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const chosen = filteredFiles.filter((f) => selectedIds.includes(f.id));
                  setPendingDeleteFiles(chosen);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus Terpilih ({selectedIds.length})
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama file backup..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed]"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              aria-label="Urutkan file"
              className="px-3 py-2 text-xs bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed]"
            >
              <option value="newest">Terbaru Diunggah</option>
              <option value="oldest">Terlama Diunggah</option>
              <option value="largest">Ukuran Terbesar</option>
              <option value="smallest">Ukuran Terkecil</option>
            </select>
          </div>
        </div>

        {errorMsg && (
          <div className="m-5 p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="h-11 bg-slate-100 dark:bg-slate-800/70 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-12 text-center">
            <FolderOpen className="w-9 h-9 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Tidak ada file backup ditemukan
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              {searchQuery
                ? `Tidak ada file yang cocok dengan kata kunci "${searchQuery}".`
                : `Folder "${folderName}" belum berisi arsip backup. Jalankan "Backup Sekarang" untuk mengunggah arsip pertama Anda.`}
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
                      aria-label="Pilih semua file"
                      checked={
                        filteredFiles.length > 0 && selectedIds.length === filteredFiles.length
                      }
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[#1d63ed]"
                    />
                  </th>
                  <th className="py-3 px-4">Nama File Backup</th>
                  <th className="py-3 px-4 text-right">Ukuran File</th>
                  <th className="py-3 px-4">Waktu Upload</th>
                  <th className="py-3 pr-6 pl-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {filteredFiles.map((file) => {
                  const isChecked = selectedIds.includes(file.id);
                  return (
                    <tr
                      key={file.id}
                      className={`transition-colors ${
                        isChecked
                          ? 'bg-blue-50/50 dark:bg-blue-950/30'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3.5 pl-6 pr-2">
                        <input
                          type="checkbox"
                          aria-label={`Pilih ${file.name}`}
                          checked={isChecked}
                          onChange={() => toggleSelect(file.id)}
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[#1d63ed]"
                        />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100 break-all">
                          {file.name}
                        </div>
                        {file.description && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-md">
                            {file.description}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                        {formatBytes(file.size)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {formatDateTimeId(file.createdTime || file.modifiedTime)}
                      </td>
                      <td className="py-3.5 pr-6 pl-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {driveSourceMode === 'oauth' && (
                            <button
                              type="button"
                              onClick={() => void handleDownload(file)}
                              disabled={downloadingId === file.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Download className="w-3.5 h-3.5" />
                              {downloadingId === file.id ? 'Mengunduh...' : 'Unduh'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setPendingDeleteFiles([file])}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 hover:bg-red-100 dark:hover:bg-red-900/60 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Mandatory Confirmation Modal */}
      {pendingDeleteFiles && pendingDeleteFiles.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/65 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-red-700 dark:text-red-400">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 id="delete-modal-title" className="text-base font-bold text-slate-900 dark:text-white">
                  Hapus {pendingDeleteFiles.length} File dari Google Drive?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !isDeleting && setPendingDeleteFiles(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
                aria-label="Tutup dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Tindakan ini akan menghapus file backup berikut secara permanen dari Google Drive Anda dan tidak dapat dibatalkan:
              </p>

              <ul className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                {pendingDeleteFiles.map((f) => (
                  <li key={f.id} className="px-3.5 py-2.5 text-xs flex items-center justify-between gap-3">
                    <span className="font-mono text-slate-900 dark:text-slate-100 truncate">{f.name}</span>
                    <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                      {formatBytes(f.size)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setPendingDeleteFiles(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDelete}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-xl transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus dari Drive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
