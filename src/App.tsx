import { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Moon,
  Play,
  Server,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { BackupConsole } from './components/BackupConsole';
import { DriveFileManager } from './components/DriveFileManager';
import { LoginPage } from './components/LoginPage';
import { ScheduleSettings } from './components/ScheduleSettings';
import { ServerConfigPanel } from './components/ServerConfigPanel';
import { SetupWizard } from './components/SetupWizard';
import {
  clearAllTokens,
  getDriveToken,
  getSessionToken,
  requestGoogleDriveAccessToken,
  setDriveToken as storeDriveToken,
  setSessionToken as storeSessionToken,
} from './lib/auth';
import {
  deleteDriveFile,
  downloadDriveFile,
  DriveAuthExpiredError,
  findOrCreateBackupFolder,
  getDriveStorageQuota,
  listBackupFiles,
} from './lib/driveApi';
import type {
  ActiveView,
  AuthStatus,
  AuthUser,
  BackupConfig,
  BackupLogEntry,
  BackupRun,
  BackupSchedule,
  DriveFileItem,
  DriveStorageQuota,
  HostInfo,
} from './types/backup';

const DEFAULT_AUTH_STATUS: AuthStatus = {
  needsFirstRunSetup: false,
  envAdminConfigured: false,
  googleClientId: '',
  allowedEmailsConfigured: false,
  isCyberPanelHost: false,
  rcloneConfigured: false,
};

const DEFAULT_CONFIG: BackupConfig = {
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
};

const DEFAULT_SCHEDULE: BackupSchedule = {
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
};

const NAV_ITEMS: Array<{ id: ActiveView; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'schedule', label: 'Jadwal Otomatis', icon: CalendarClock },
  { id: 'drive', label: 'File Google Drive', icon: FolderOpen },
  { id: 'config', label: 'Konfigurasi Server', icon: Settings },
];

const SETUP_DONE_STORAGE_KEY = 'cybervault_setup_done_v2';
const THEME_STORAGE_KEY = 'cybervault_theme';

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage failures
    }
  }, [isDark]);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => !prev);
  }, []);

  const [authReady, setAuthReady] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(DEFAULT_AUTH_STATUS);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(() => getSessionToken());
  const [driveToken, setDriveToken] = useState<string | null>(() => getDriveToken());

  const [activeView, setActiveView] = useState<ActiveView>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [config, setConfig] = useState<BackupConfig>(DEFAULT_CONFIG);
  const [schedule, setSchedule] = useState<BackupSchedule>(DEFAULT_SCHEDULE);
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [hostInfo, setHostInfo] = useState<HostInfo>({
    isCyberPanelHost: false,
    rcloneConfigured: false,
    rcloneRemote: 'gdrive',
  });
  const [selectedDomains, setSelectedDomains] = useState<string[]>(DEFAULT_CONFIG.domains);

  const [isSyncingWebsites, setIsSyncingWebsites] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [driveQuota, setDriveQuota] = useState<DriveStorageQuota | null>(null);
  const [driveScope, setDriveScope] = useState<'folder' | 'all_backups'>('folder');
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [backupStage, setBackupStage] = useState('Menunggu perintah eksekusi');
  const [logs, setLogs] = useState<BackupLogEntry[]>([]);

  const loadAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status');
      if (res.ok) {
        const data = (await res.json()) as AuthStatus;
        setAuthStatus(data);
        setHostInfo((prev) => ({
          ...prev,
          isCyberPanelHost: Boolean(data.isCyberPanelHost),
          rcloneConfigured: Boolean(data.rcloneConfigured),
        }));
      }
    } catch {
      // Ignore transient network errors during boot
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    void loadAuthStatus();
  }, [loadAuthStatus]);

  const handleLogout = useCallback(() => {
    clearAllTokens();
    setSessionToken(null);
    setDriveToken(null);
    setUser(null);
    setDriveFiles([]);
    setDriveQuota(null);
    setDriveError(null);
    setShowSetupWizard(false);
    void loadAuthStatus();
  }, [loadAuthStatus]);

  const fetchServerState = useCallback(
    async (activeSessionToken?: string) => {
      const tokenToUse = activeSessionToken || sessionToken;
      if (!tokenToUse) return;
      const res = await fetch('/api/state', {
        headers: {
          Authorization: `Bearer ${tokenToUse}`,
        },
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as {
        config: BackupConfig;
        schedule: BackupSchedule;
        runs: BackupRun[];
        hostInfo: HostInfo;
      };
      setConfig(data.config);
      setSchedule(data.schedule);
      setRuns(data.runs || []);
      setHostInfo(data.hostInfo);
      setSelectedDomains((prev) => {
        if (prev.length === 0) return data.config.domains;
        const allowed = new Set(data.config.domains);
        const kept = prev.filter((d) => allowed.has(d));
        const newlyAdded = data.config.domains.filter((d) => !prev.includes(d));
        return kept.length === 0 && newlyAdded.length === 0
          ? data.config.domains
          : [...kept, ...newlyAdded];
      });
    },
    [sessionToken, handleLogout]
  );

  useEffect(() => {
    if (!user || !sessionToken) return;
    void fetchServerState(sessionToken);

    if (!window.localStorage.getItem(SETUP_DONE_STORAGE_KEY)) {
      setShowSetupWizard(true);
    }

    const pollTimer = window.setInterval(() => {
      if (!isBackingUp) {
        void fetchServerState(sessionToken);
      }
    }, 60000);

    return () => window.clearInterval(pollTimer);
  }, [user, sessionToken, isBackingUp, fetchServerState]);

  const handleDriveTokenExpired = useCallback(() => {
    storeDriveToken(null);
    setDriveToken(null);
    setDriveError(
      'Token sesi Google Drive berakhir. Klik "Hubungkan Akun Google Drive" untuk memperbarui otorisasi.'
    );
  }, []);

  const handleConnectGoogleDrive = useCallback(async (): Promise<string> => {
    setDriveError(null);
    const token = await requestGoogleDriveAccessToken(authStatus.googleClientId);
    storeDriveToken(token);
    setDriveToken(token);
    return token;
  }, [authStatus.googleClientId]);

  const driveSourceMode: 'oauth' | 'rclone' | 'disconnected' = driveToken
    ? 'oauth'
    : hostInfo.rcloneConfigured
      ? 'rclone'
      : 'disconnected';

  const refreshDriveData = useCallback(
    async (overrideFolderId?: string, overrideScope?: 'folder' | 'all_backups') => {
      if (!user || !sessionToken) return;

      if (driveToken) {
        setDriveLoading(true);
        setDriveError(null);
        try {
          let resolvedFolderId = overrideFolderId ?? config.driveFolderId;
          const targetScope = overrideScope ?? driveScope;

          if (targetScope === 'folder' && !resolvedFolderId) {
            const folder = await findOrCreateBackupFolder(driveToken, config.driveFolderName);
            resolvedFolderId = folder.id;
            const saveRes = await fetch('/api/config', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${sessionToken}`,
              },
              body: JSON.stringify({
                ...config,
                driveFolderName: folder.name,
                driveFolderId: folder.id,
              }),
            });
            if (saveRes.ok) {
              const saved = (await saveRes.json()) as { config: BackupConfig };
              setConfig(saved.config);
            }
          }

          const [filesRes, quotaRes] = await Promise.all([
            listBackupFiles(driveToken, {
              folderId: resolvedFolderId,
              scope: targetScope,
            }),
            getDriveStorageQuota(driveToken),
          ]);

          setDriveFiles(filesRes);
          setDriveQuota(quotaRes);
        } catch (err) {
          if (err instanceof DriveAuthExpiredError) {
            handleDriveTokenExpired();
            return;
          }
          setDriveError(err instanceof Error ? err.message : 'Gagal memuat data Google Drive.');
        } finally {
          setDriveLoading(false);
        }
        return;
      }

      if (hostInfo.rcloneConfigured) {
        setDriveLoading(true);
        setDriveError(null);
        try {
          const res = await fetch(
            `/api/rclone/files?folder=${encodeURIComponent(config.driveFolderName)}`,
            {
              headers: { Authorization: `Bearer ${sessionToken}` },
            }
          );
          if (res.status === 401) {
            handleLogout();
            return;
          }
          const data = (await res.json()) as { files?: DriveFileItem[]; error?: string };
          if (!res.ok) {
            throw new Error(data.error || 'Gagal membaca daftar file melalui rclone.');
          }
          setDriveFiles(data.files || []);
          setDriveQuota(null);
        } catch (err) {
          setDriveError(err instanceof Error ? err.message : 'Gagal memuat file via rclone.');
        } finally {
          setDriveLoading(false);
        }
      }
    },
    [
      user,
      sessionToken,
      driveToken,
      hostInfo.rcloneConfigured,
      config,
      driveScope,
      handleDriveTokenExpired,
      handleLogout,
    ]
  );

  useEffect(() => {
    if (user && sessionToken && (driveToken || hostInfo.rcloneConfigured)) {
      void refreshDriveData();
    }
  }, [
    user,
    sessionToken,
    driveToken,
    hostInfo.rcloneConfigured,
    config.driveFolderName,
    config.driveFolderId,
    driveScope,
    refreshDriveData,
  ]);

  const handleSaveConfig = async (
    updated: Omit<BackupConfig, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!sessionToken) throw new Error('Sesi belum aktif.');
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(updated),
    });
    if (res.status === 401) {
      handleLogout();
      throw new Error('Sesi berakhir.');
    }
    const data = (await res.json()) as { config?: BackupConfig; error?: string };
    if (!res.ok || !data.config) {
      throw new Error(data.error || 'Gagal menyimpan konfigurasi server.');
    }
    setConfig(data.config);
    setSelectedDomains(data.config.domains);
  };

  const handleSaveSchedule = async (
    updated: Omit<BackupSchedule, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!sessionToken) throw new Error('Sesi belum aktif.');
    const res = await fetch('/api/schedule', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(updated),
    });
    if (res.status === 401) {
      handleLogout();
      throw new Error('Sesi berakhir.');
    }
    const data = (await res.json()) as { schedule?: BackupSchedule; error?: string };
    if (!res.ok || !data.schedule) {
      throw new Error(data.error || 'Gagal menyimpan jadwal otomatis.');
    }
    setSchedule(data.schedule);
  };

  const handleSyncCyberPanelWebsites = useCallback(async (): Promise<string[]> => {
    if (!sessionToken) return config.domains;
    setIsSyncingWebsites(true);
    setSyncStatusMsg(null);
    try {
      const res = await fetch('/api/cyberpanel/websites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      if (res.status === 401) {
        handleLogout();
        return config.domains;
      }
      const data = (await res.json()) as {
        isCyberPanelHost?: boolean;
        websites?: Array<{
          domain: string;
          state: string;
          docRoot?: string;
          projectRoot?: string;
          framework?: string;
        }>;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyinkronkan website CyberPanel.');
      }
      setSyncStatusMsg(data.message || 'Pemeriksaan website selesai.');

      const discoveredList = data.websites || [];
      const discovered = discoveredList.map((w) => w.domain);
      if (discovered.length === 0) {
        return config.domains;
      }

      const merged = Array.from(new Set([...discovered, ...config.domains])).slice(0, 100);
      const nextPaths: Record<string, string> = { ...(config.domainPaths || {}) };
      for (const site of discoveredList) {
        const detectedPath = site.projectRoot || site.docRoot;
        if (detectedPath && !nextPaths[site.domain]) {
          nextPaths[site.domain] = detectedPath;
        } else if (
          detectedPath &&
          nextPaths[site.domain] === `/home/${site.domain}/public_html` &&
          detectedPath !== nextPaths[site.domain]
        ) {
          nextPaths[site.domain] = detectedPath;
        }
      }

      const saveRes = await fetch('/api/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          ...config,
          domains: merged,
          domainPaths: nextPaths,
        }),
      });
      if (saveRes.ok) {
        const saved = (await saveRes.json()) as { config: BackupConfig };
        setConfig(saved.config);
      }
      setSelectedDomains(merged);
      return merged;
    } catch (err) {
      setSyncStatusMsg(
        err instanceof Error ? err.message : 'Gagal mengambil daftar website CyberPanel.'
      );
      return config.domains;
    } finally {
      setIsSyncingWebsites(false);
    }
  }, [sessionToken, config, handleLogout]);

  const handleToggleDomain = (domain: string) => {
    setSelectedDomains((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    );
  };

  const handleToggleAllDomains = () => {
    if (selectedDomains.length === config.domains.length) {
      setSelectedDomains([]);
    } else {
      setSelectedDomains(config.domains);
    }
  };

  const runBackupJob = useCallback(
    async (triggerType: 'manual' | 'scheduled') => {
      if (!user || !sessionToken || isBackingUp) return;

      const domainsToBackup =
        triggerType === 'scheduled'
          ? config.domains
          : selectedDomains.length > 0
            ? selectedDomains
            : config.domains;

      setIsBackingUp(true);
      setBackupProgress(2);
      setBackupStage('Menghubungkan ke mesin backup server...');
      setLogs([]);
      setActiveView('overview');

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        };
        if (driveToken) {
          headers['X-Drive-Token'] = driveToken;
        }

        const response = await fetch('/api/backup/run', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            serverName: config.serverName,
            cyberpanelUrl: config.cyberpanelUrl,
            cyberpanelUsername: config.cyberpanelUsername,
            backupMode: config.backupMode,
            domains: domainsToBackup,
            domainPaths: config.domainPaths || {},
            includeFiles: config.includeFiles,
            includeDatabases: config.includeDatabases,
            includeEmails: config.includeEmails,
            includeSslDns: config.includeSslDns,
            excludeHeavyDeps: config.excludeHeavyDeps ?? true,
            driveFolderName: config.driveFolderName,
            driveFolderId: config.driveFolderId,
            compressionFormat: config.compressionFormat,
            triggerType,
            autoPruneDrive: schedule.autoPruneDrive,
            maxRetentionFiles: schedule.maxRetentionFiles,
          }),
        });

        if (response.status === 401) {
          handleLogout();
          return;
        }
        if (!response.ok || !response.body) {
          const text = await response.text();
          throw new Error(text || `Server merespons status ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let completedPayload: {
          archiveName: string;
          archiveSizeBytes: number;
          driveFileId: string;
          driveFolderId: string;
          durationMs: number;
          storageTarget?: string;
        } | null = null;
        let streamError: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';

          for (const frame of frames) {
            const lines = frame.split('\n');
            let eventType = 'message';
            let dataStr = '';
            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataStr += line.slice(5).trim();
              }
            }
            if (!dataStr) continue;

            const parsed = JSON.parse(dataStr) as Record<string, unknown>;
            if (eventType === 'log') {
              setLogs((prev) => [
                ...prev,
                {
                  id: String(parsed.id || Date.now()),
                  timestamp: String(parsed.timestamp || new Date().toISOString()),
                  level: (parsed.level as BackupLogEntry['level']) || 'INFO',
                  message: String(parsed.message || ''),
                },
              ]);
            } else if (eventType === 'progress') {
              setBackupProgress(Number(parsed.progress || 0));
              setBackupStage(String(parsed.stage || 'Memproses backup...'));
            } else if (eventType === 'complete') {
              completedPayload = {
                archiveName: String(parsed.archiveName || ''),
                archiveSizeBytes: Number(parsed.archiveSizeBytes || 0),
                driveFileId: String(parsed.driveFileId || ''),
                driveFolderId: String(parsed.driveFolderId || ''),
                durationMs: Number(parsed.durationMs || 0),
                storageTarget: parsed.storageTarget ? String(parsed.storageTarget) : undefined,
              };
            } else if (eventType === 'error') {
              streamError = String(parsed.message || 'Eksekusi backup gagal.');
            }
          }
        }

        if (streamError) {
          if (streamError.includes('(401)') && driveToken) {
            handleDriveTokenExpired();
          }
          throw new Error(streamError);
        }

        if (completedPayload) {
          setBackupProgress(100);
          setBackupStage(
            completedPayload.storageTarget === 'local_snapshot'
              ? 'Arsip tersimpan lokal di server VPS'
              : 'Backup selesai & tersimpan di Google Drive'
          );
          await fetchServerState(sessionToken);
          if (driveToken || hostInfo.rcloneConfigured) {
            await refreshDriveData(completedPayload.driveFolderId || undefined);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal menjalankan backup.';
        setBackupStage('Eksekusi backup gagal');
        setLogs((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            message: msg,
          },
        ]);
        await fetchServerState(sessionToken);
      } finally {
        setIsBackingUp(false);
      }
    },
    [
      user,
      sessionToken,
      driveToken,
      config,
      schedule,
      selectedDomains,
      isBackingUp,
      hostInfo.rcloneConfigured,
      fetchServerState,
      refreshDriveData,
      handleLogout,
      handleDriveTokenExpired,
    ]
  );

  const handleProbeEndpoint = async (url: string) => {
    if (!sessionToken) throw new Error('Sesi belum aktif.');
    const res = await fetch('/api/cyberpanel/probe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ cyberpanelUrl: url }),
    });
    if (res.status === 401) {
      handleLogout();
      throw new Error('Sesi berakhir.');
    }
    const data = (await res.json()) as {
      reachable?: boolean;
      statusCode?: number;
      latencyMs?: number;
      message?: string;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || 'Gagal menguji koneksi.');
    }
    return {
      reachable: Boolean(data.reachable),
      statusCode: Number(data.statusCode || 0),
      latencyMs: Number(data.latencyMs || 0),
      message: data.message || 'Selesai',
    };
  };

  const handleVerifyDriveFolder = async (folderName: string) => {
    let activeDriveToken = driveToken;
    if (!activeDriveToken) {
      activeDriveToken = await handleConnectGoogleDrive();
    }
    try {
      return await findOrCreateBackupFolder(activeDriveToken, folderName);
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        handleDriveTokenExpired();
      }
      throw err;
    }
  };

  const handleDeleteDriveFiles = async (filesToDelete: DriveFileItem[]) => {
    if (driveToken) {
      try {
        for (const file of filesToDelete) {
          await deleteDriveFile(driveToken, file.id);
        }
        await refreshDriveData();
      } catch (err) {
        if (err instanceof DriveAuthExpiredError) {
          handleDriveTokenExpired();
          return;
        }
        setDriveError(err instanceof Error ? err.message : 'Gagal menghapus file di Google Drive.');
      }
      return;
    }

    if (hostInfo.rcloneConfigured && sessionToken) {
      try {
        for (const file of filesToDelete) {
          const res = await fetch('/api/rclone/files', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({
              fileName: file.name,
              folderName: config.driveFolderName,
            }),
          });
          if (!res.ok) {
            const data = (await res.json()) as { error?: string };
            throw new Error(data.error || `Gagal menghapus ${file.name} via rclone.`);
          }
        }
        await refreshDriveData();
      } catch (err) {
        setDriveError(err instanceof Error ? err.message : 'Gagal menghapus file via rclone.');
      }
    }
  };

  const handleDownloadDriveFile = async (file: DriveFileItem) => {
    if (!driveToken) return;
    try {
      await downloadDriveFile(driveToken, file.id, file.name);
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        handleDriveTokenExpired();
        return;
      }
      setDriveError(err instanceof Error ? err.message : 'Gagal mengunduh file dari Google Drive.');
    }
  };

  const handleCompleteSetup = () => {
    window.localStorage.setItem(SETUP_DONE_STORAGE_KEY, '1');
    setShowSetupWizard(false);
  };

  const handleSaveFolderFromWizard = async (folderName: string, folderId: string) => {
    await handleSaveConfig({
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
      driveFolderName: folderName,
      driveFolderId: folderId,
      compressionFormat: config.compressionFormat,
      retentionCount: config.retentionCount,
    });
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#f4f7fb] dark:bg-slate-950 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Memeriksa konfigurasi server...
        </div>
      </div>
    );
  }

  if (!user || !sessionToken) {
    return (
      <LoginPage
        authStatus={authStatus}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onAuthenticated={(signedUser, token, nextDriveToken) => {
          storeSessionToken(token);
          setSessionToken(token);
          if (nextDriveToken) {
            storeDriveToken(nextDriveToken);
            setDriveToken(nextDriveToken);
          }
          setUser(signedUser);
        }}
        onBootstrapComplete={() => {
          setAuthStatus((prev) => ({ ...prev, needsFirstRunSetup: false }));
        }}
      />
    );
  }

  const activeNavItem = NAV_ITEMS.find((n) => n.id === activeView) || NAV_ITEMS[0];
  const operatorLabel = user.email || user.username || user.displayName;
  const operatorDisplayName = user.displayName || user.username || user.email || 'Administrator';
  const avatarInitial = operatorDisplayName.trim().charAt(0).toUpperCase() || 'A';

  return (
    <div className="min-h-screen bg-[#f4f7fb] dark:bg-slate-950 flex transition-colors">
      {/* Desktop Royal-Blue Gradient Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-gradient-to-b from-[#0b43b8] via-[#0a3aa0] to-[#062b7d] text-white shrink-0 shadow-lg shadow-blue-950/15">
        <div className="px-5 py-5 flex items-center gap-3 border-b border-white/10">
          <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
            <Server className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white tracking-tight truncate">
              CyberVault SMKN 1
            </div>
            <div className="text-[11px] text-blue-200/80 font-mono truncate">
              {config.domains.length} Domain · {schedule.enabled ? 'Auto 24/7' : 'Dijeda'}
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3.5 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-white text-[#0b43b8] font-semibold shadow-sm'
                    : 'text-blue-100/85 hover:text-white hover:bg-white/10 font-medium'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2.5">
          {!driveToken && Boolean(authStatus.googleClientId) && (
            <button
              type="button"
              onClick={() => void handleConnectGoogleDrive()}
              className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-300/30 rounded-xl transition-colors cursor-pointer"
            >
              <Link2 className="w-3.5 h-3.5 shrink-0" />
              Hubungkan Google Drive
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSetupWizard(true)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-blue-50 bg-white/10 hover:bg-white/15 border border-white/15 rounded-xl transition-colors cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 shrink-0" />
            Panduan Setup Awal
          </button>

          <div className="px-1.5 pt-1.5">
            <div className="text-xs font-semibold text-white truncate">{operatorDisplayName}</div>
            <div className="text-[11px] text-blue-200/80 truncate">
              {user.authMethod === 'google' ? user.email : `Admin Lokal (${user.username})`}
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-blue-100 hover:text-white hover:bg-white/10 border border-white/15 rounded-xl transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            Keluar Panel
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-gradient-to-b from-[#0b43b8] via-[#0a3aa0] to-[#062b7d] text-white h-full flex flex-col z-10 shadow-xl">
            <div className="px-5 py-4 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center">
                  <Server className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-bold text-white">CyberVault SMKN 1</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-blue-100 hover:text-white rounded-lg"
                aria-label="Tutup menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3.5 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveView(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all ${
                      isActive
                        ? 'bg-white text-[#0b43b8] font-semibold shadow-sm'
                        : 'text-blue-100/85 hover:text-white hover:bg-white/10 font-medium'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-white/10 space-y-2.5">
              {!driveToken && Boolean(authStatus.googleClientId) && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    void handleConnectGoogleDrive();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-emerald-500/20 border border-emerald-300/30 rounded-xl"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Hubungkan Google Drive
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowSetupWizard(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-blue-50 bg-white/10 border border-white/15 rounded-xl"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                Panduan Setup Awal
              </button>
              <div className="text-xs text-blue-100/80 truncate">{operatorLabel}</div>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-white/10 border border-white/15 rounded-xl"
              >
                <LogOut className="w-3.5 h-3.5" />
                Keluar Panel
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30 transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">
                CyberPanel Backup
              </span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <h1 className="font-bold text-slate-900 dark:text-white truncate">
                {activeNavItem.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
              title={isDark ? 'Mode terang' : 'Mode gelap'}
              className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors cursor-pointer"
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-[#1d63ed]" />
              )}
            </button>

            {activeView !== 'overview' && (
              <button
                type="button"
                onClick={() => void runBackupJob('manual')}
                disabled={isBackingUp}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-[#1d63ed] to-[#0c45b6] hover:from-[#1755d1] hover:to-[#0a3a99] disabled:opacity-60 rounded-xl shadow-xs transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {isBackingUp ? `Proses (${backupProgress}%)` : 'Backup Sekarang'}
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveView('config')}
              aria-label="Konfigurasi Server"
              title="Konfigurasi Server"
              className="hidden sm:flex w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 items-center justify-center transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 pl-1 border-l border-slate-200 dark:border-slate-800">
              <div
                title={operatorDisplayName}
                className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1d63ed] to-[#0c45b6] text-white text-xs font-bold flex items-center justify-center shadow-xs select-none"
              >
                {avatarInitial}
              </div>
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Keluar panel"
                title="Keluar panel"
                className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto">
          {activeView === 'overview' && (
            <BackupConsole
              operatorName={operatorDisplayName}
              config={config}
              schedule={schedule}
              runs={runs}
              selectedDomains={selectedDomains}
              isSyncingWebsites={isSyncingWebsites}
              syncStatusMsg={syncStatusMsg}
              driveFileCount={driveFiles.length}
              driveQuota={driveQuota}
              isBackingUp={isBackingUp}
              progress={backupProgress}
              stageLabel={backupStage}
              logs={logs}
              onToggleDomain={handleToggleDomain}
              onToggleAllDomains={handleToggleAllDomains}
              onSyncWebsites={() => void handleSyncCyberPanelWebsites()}
              onStartBackup={() => void runBackupJob('manual')}
              onClearLogs={() => setLogs([])}
              onNavigate={setActiveView}
            />
          )}

          {activeView === 'schedule' && (
            <ScheduleSettings schedule={schedule} onSaveSchedule={handleSaveSchedule} />
          )}

          {activeView === 'drive' && (
            <DriveFileManager
              files={driveFiles}
              quota={driveQuota}
              folderName={config.driveFolderName}
              scope={driveScope}
              driveSourceMode={driveSourceMode}
              canConnectGoogleDrive={Boolean(authStatus.googleClientId)}
              isLoading={driveLoading}
              errorMsg={driveError}
              onConnectGoogleDrive={async () => {
                await handleConnectGoogleDrive();
              }}
              onChangeScope={setDriveScope}
              onRefresh={() => void refreshDriveData()}
              onDownloadFile={handleDownloadDriveFile}
              onDeleteFiles={handleDeleteDriveFiles}
            />
          )}

          {activeView === 'config' && (
            <ServerConfigPanel
              config={config}
              schedule={schedule}
              isSyncingWebsites={isSyncingWebsites}
              syncStatusMsg={syncStatusMsg}
              onSyncWebsites={handleSyncCyberPanelWebsites}
              onSaveConfig={handleSaveConfig}
              onProbeEndpoint={handleProbeEndpoint}
              onVerifyDriveFolder={handleVerifyDriveFolder}
            />
          )}
        </main>
      </div>

      <SetupWizard
        isOpen={showSetupWizard}
        operatorLabel={operatorLabel}
        config={config}
        schedule={schedule}
        isCyberPanelHost={hostInfo.isCyberPanelHost}
        rcloneConfigured={hostInfo.rcloneConfigured}
        hasDriveOAuth={Boolean(driveToken)}
        canConnectGoogleDrive={Boolean(authStatus.googleClientId)}
        isSyncingWebsites={isSyncingWebsites}
        syncStatusMsg={syncStatusMsg}
        onSyncWebsites={handleSyncCyberPanelWebsites}
        onConnectGoogleDrive={async () => {
          await handleConnectGoogleDrive();
        }}
        onVerifyDriveFolder={handleVerifyDriveFolder}
        onSaveFolderToConfig={handleSaveFolderFromWizard}
        onNavigate={setActiveView}
        onComplete={handleCompleteSetup}
      />
    </div>
  );
}
