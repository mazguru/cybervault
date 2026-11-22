export type ActiveView = 'overview' | 'schedule' | 'drive' | 'config';

export type BackupFrequency = 'daily' | 'weekly' | 'monthly' | 'interval_6h' | 'interval_12h';

export type ServerTimezone = 'Asia/Jakarta' | 'Asia/Makassar' | 'Asia/Jayapura' | 'UTC';

export interface AuthUser {
  id: string;
  username?: string;
  email?: string;
  displayName: string;
  authMethod: 'local' | 'google';
}

export interface AuthStatus {
  needsFirstRunSetup: boolean;
  envAdminConfigured: boolean;
  googleClientId: string;
  allowedEmailsConfigured: boolean;
  isCyberPanelHost: boolean;
  rcloneConfigured: boolean;
}

export interface HostInfo {
  isCyberPanelHost: boolean;
  rcloneConfigured: boolean;
  rcloneRemote: string;
}

export interface BackupConfig {
  id: string;
  ownerId?: string;
  serverName: string;
  cyberpanelUrl: string;
  cyberpanelUsername: string;
  backupMode: 'api_and_drive' | 'snapshot_and_drive';
  domains: string[];
  domainPaths?: Record<string, string>;
  includeFiles: boolean;
  includeDatabases: boolean;
  includeEmails: boolean;
  includeSslDns: boolean;
  excludeHeavyDeps?: boolean;
  driveFolderName: string;
  driveFolderId: string;
  compressionFormat: 'tar.gz' | 'tar.zst';
  retentionCount: number;
  updatedAt?: string;
}

export interface BackupSchedule {
  id: string;
  ownerId?: string;
  enabled: boolean;
  frequency: BackupFrequency;
  timeOfDay: string;
  dayOfWeek: number;
  dayOfMonth: number;
  timezone: ServerTimezone;
  autoPruneDrive: boolean;
  maxRetentionFiles: number;
  notifyEmail: string;
  lastTriggeredAt: string;
  updatedAt?: string;
}

export interface BackupRun {
  id: string;
  ownerId?: string;
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
  createdAt?: string;
  updatedAt?: string;
}

export interface BackupLogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'OK' | 'WARN' | 'ERROR';
  message: string;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime: string;
  modifiedTime: string;
  parents?: string[];
  webViewLink?: string;
  description?: string;
}

export interface DriveStorageQuota {
  limit: number;
  usage: number;
  usageInDrive: number;
  usageInDriveTrash: number;
}
