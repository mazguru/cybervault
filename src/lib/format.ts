import type { BackupConfig, BackupSchedule } from '../types/backup';

const DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, exp);
  return `${val >= 100 || exp === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[exp]}`;
}

export function formatDateTimeId(input: unknown): string {
  if (!input) return '—';
  let date: Date;
  if (input instanceof Date) {
    date = input;
  } else if (typeof input === 'string' || typeof input === 'number') {
    date = new Date(input);
  } else if (typeof input === 'object' && input !== null && 'seconds' in input) {
    date = new Date((input as { seconds: number }).seconds * 1000);
  } else {
    return '—';
  }
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatTimeShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function buildCronExpression(schedule: BackupSchedule): string {
  const [hourStr = '02', minStr = '00'] = (schedule.timeOfDay || '02:00').split(':');
  const min = Number(minStr);
  const hour = Number(hourStr);

  switch (schedule.frequency) {
    case 'interval_6h':
      return `${min} */6 * * *`;
    case 'interval_12h':
      return `${min} */12 * * *`;
    case 'weekly':
      return `${min} ${hour} * * ${schedule.dayOfWeek}`;
    case 'monthly':
      return `${min} ${hour} ${schedule.dayOfMonth} * *`;
    case 'daily':
    default:
      return `${min} ${hour} * * *`;
  }
}

export function formatScheduleSummary(schedule: BackupSchedule): string {
  const tzShort =
    schedule.timezone === 'Asia/Jakarta'
      ? 'WIB'
      : schedule.timezone === 'Asia/Makassar'
        ? 'WITA'
        : schedule.timezone === 'Asia/Jayapura'
          ? 'WIT'
          : 'UTC';

  switch (schedule.frequency) {
    case 'interval_6h':
      return `Setiap 6 jam sekali (${tzShort})`;
    case 'interval_12h':
      return `Setiap 12 jam sekali (${tzShort})`;
    case 'weekly':
      return `Setiap ${DAY_NAMES_ID[schedule.dayOfWeek] || 'Minggu'} pukul ${schedule.timeOfDay} ${tzShort}`;
    case 'monthly':
      return `Setiap tanggal ${schedule.dayOfMonth} pukul ${schedule.timeOfDay} ${tzShort}`;
    case 'daily':
    default:
      return `Setiap hari pukul ${schedule.timeOfDay} ${tzShort}`;
  }
}

export function computeNextRunText(schedule: BackupSchedule): string {
  if (!schedule.enabled) return 'Jadwal dijeda';
  const now = new Date();
  const [h = 2, m = 0] = schedule.timeOfDay.split(':').map(Number);

  if (schedule.frequency === 'interval_6h' || schedule.frequency === 'interval_12h') {
    const stepHours = schedule.frequency === 'interval_6h' ? 6 : 12;
    const candidate = new Date(now);
    candidate.setMinutes(m, 0, 0);
    while (candidate <= now) {
      candidate.setHours(candidate.getHours() + stepHours);
    }
    return formatDateTimeId(candidate);
  }

  const candidate = new Date(now);
  candidate.setHours(h, m, 0, 0);

  if (schedule.frequency === 'daily') {
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
    return formatDateTimeId(candidate);
  }

  if (schedule.frequency === 'weekly') {
    const diff = (schedule.dayOfWeek - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + diff);
    if (candidate <= now) candidate.setDate(candidate.getDate() + 7);
    return formatDateTimeId(candidate);
  }

  candidate.setDate(schedule.dayOfMonth);
  if (candidate <= now) candidate.setMonth(candidate.getMonth() + 1);
  return formatDateTimeId(candidate);
}

export function generateRcloneScript(config: BackupConfig, schedule: BackupSchedule): string {
  const cronExpr = buildCronExpression(schedule);
  const domains = config.domains.length > 0 ? config.domains : ['smkn1temon.sch.id'];
  const domainsList = domains.map((d) => `  "${d}"`).join('\n');

  const externalPathBlocks = domains
    .map((d) => ({ domain: d, customPath: (config.domainPaths?.[d] || '').trim() }))
    .filter(({ domain, customPath }) => customPath && !customPath.startsWith(`/home/${domain}/`) && customPath !== `/home/${domain}`)
    .map(({ domain, customPath }) => {
      const safePath = customPath.replace(/["`$\\]/g, '');
      const excludeFlags = config.excludeHeavyDeps !== false ? '--exclude="vendor" --exclude="node_modules" --exclude=".git"' : '';
      return `if [ -d "${safePath}" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Mengarsipkan direktori proyek kustom (${domain}): ${safePath}"
  tar ${excludeFlags} -czf "$BACKUP_DIR/custom-${domain}-$(date +%Y%m%d-%H%M%S).tar.gz" -C "$(dirname "${safePath}")" "$(basename "${safePath}")"
  if [ -f "${safePath}/.env" ]; then
    DB_NAME=$(grep -E '^DB_DATABASE=' "${safePath}/.env" | head -n1 | cut -d= -f2- | tr -d '"'\''\\r ')
    DB_USER=$(grep -E '^DB_USERNAME=' "${safePath}/.env" | head -n1 | cut -d= -f2- | tr -d '"'\''\\r ')
    DB_PASS=$(grep -E '^DB_PASSWORD=' "${safePath}/.env" | head -n1 | cut -d= -f2- | tr -d '"'\''\\r ')
    DB_HOST=$(grep -E '^DB_HOST=' "${safePath}/.env" | head -n1 | cut -d= -f2- | tr -d '"'\''\\r ')
    if [ -n "$DB_NAME" ] && [ -n "$DB_USER" ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Dump database MariaDB ($DB_NAME) untuk ${domain}..."
      MYSQL_PWD="$DB_PASS" mysqldump --single-transaction --quick -h "\${DB_HOST:-127.0.0.1}" -u "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_DIR/db-${domain}-$DB_NAME-$(date +%Y%m%d-%H%M%S).sql.gz"
    fi
  fi
fi`;
    })
    .join('\n\n');

  return `#!/usr/bin/env bash
# Script Otomatis Backup CyberPanel & Laravel ke Google Drive
# Server: ${config.serverName}
# Jadwal Cron: ${cronExpr} (${formatScheduleSummary(schedule)})

set -euo pipefail

BACKUP_DIR="/home/backup"
GDRIVE_TARGET="gdrive:${config.driveFolderName}"
MAX_FILES=${schedule.maxRetentionFiles}
DOMAINS=(
${domainsList}
)

mkdir -p "$BACKUP_DIR"

for DOMAIN in "\${DOMAINS[@]}"; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Menjalankan CyberPanel backup (/home/$DOMAIN + DB): $DOMAIN"
  cyberpanel createBackup --domainName "$DOMAIN"
done

${externalPathBlocks ? `# Backup tambahan untuk proyek Laravel / aplikasi di luar /home/<domain>\n${externalPathBlocks}\n` : ''}echo "[$(date '+%Y-%m-%d %H:%M:%S')] Mengunggah arsip ke Google Drive ($GDRIVE_TARGET)..."
rclone copy "$BACKUP_DIR" "$GDRIVE_TARGET" --include "*.${config.compressionFormat}" --transfers 2 --progress

${
  schedule.autoPruneDrive
    ? `# Hapus arsip lama jika melebihi batas retensi (${schedule.maxRetentionFiles} file)
rclone lsf "$GDRIVE_TARGET" --files-only --format "tp" | sort -r | tail -n +$((MAX_FILES + 1)) | cut -d';' -f2- | while read -r OLD_FILE; do
  [ -n "$OLD_FILE" ] && rclone deletefile "$GDRIVE_TARGET/$OLD_FILE"
done`
    : '# Auto-prune dinonaktifkan pada pengaturan retensi'
}

# Pasang di crontab (crontab -e):
# ${cronExpr} /root/cyberpanel-gdrive-backup.sh >> /var/log/cyberpanel-gdrive.log 2>&1
`;
}
