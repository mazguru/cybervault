import type { DriveFileItem, DriveStorageQuota } from '../types/backup';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export class DriveAuthExpiredError extends Error {
  constructor(message = 'Sesi token Google Drive kedaluwarsa. Silakan autentikasi ulang.') {
    super(message);
    this.name = 'DriveAuthExpiredError';
  }
}

function escapeQueryValue(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function driveFetch(url: string, accessToken: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new DriveAuthExpiredError();
  }

  return res;
}

export async function getDriveStorageQuota(accessToken: string): Promise<DriveStorageQuota> {
  const res = await driveFetch(`${DRIVE_API}/about?fields=storageQuota`, accessToken);
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Gagal memuat kuota Google Drive (${res.status}): ${msg}`);
  }
  const data = (await res.json()) as {
    storageQuota?: {
      limit?: string;
      usage?: string;
      usageInDrive?: string;
      usageInDriveTrash?: string;
    };
  };
  const q = data.storageQuota || {};
  return {
    limit: Number(q.limit || 0),
    usage: Number(q.usage || 0),
    usageInDrive: Number(q.usageInDrive || 0),
    usageInDriveTrash: Number(q.usageInDriveTrash || 0),
  };
}

export async function findOrCreateBackupFolder(
  accessToken: string,
  folderName: string
): Promise<{ id: string; name: string }> {
  const cleanName = folderName.trim() || 'CyberPanel-Backups';
  const query = `name='${escapeQueryValue(cleanName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await driveFetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=5`,
    accessToken
  );

  if (!searchRes.ok) {
    throw new Error(`Gagal mencari folder di Google Drive (${searchRes.status}).`);
  }

  const searchJson = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
  if (searchJson.files && searchJson.files.length > 0) {
    return searchJson.files[0];
  }

  const createRes = await driveFetch(`${DRIVE_API}/files?fields=id,name`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: cleanName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Gagal membuat folder "${cleanName}" di Google Drive.`);
  }

  return (await createRes.json()) as { id: string; name: string };
}

export async function listBackupFiles(
  accessToken: string,
  options: {
    folderId?: string;
    scope: 'folder' | 'all_backups';
    searchTerm?: string;
  }
): Promise<DriveFileItem[]> {
  const clauses: string[] = [
    'trashed=false',
    "mimeType!='application/vnd.google-apps.folder'",
  ];

  if (options.scope === 'folder' && options.folderId) {
    clauses.push(`'${escapeQueryValue(options.folderId)}' in parents`);
  } else {
    clauses.push(
      "(name contains '.tar.gz' or name contains '.tgz' or name contains '.zip' or name contains '.zst' or name contains '.sql' or name contains 'backup' or name contains 'cyberpanel')"
    );
  }

  if (options.searchTerm && options.searchTerm.trim()) {
    clauses.push(`name contains '${escapeQueryValue(options.searchTerm.trim())}'`);
  }

  const q = clauses.join(' and ');
  const params = new URLSearchParams({
    q,
    orderBy: 'createdTime desc',
    pageSize: '100',
    fields: 'files(id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink,description)',
  });

  const res = await driveFetch(`${DRIVE_API}/files?${params.toString()}`, accessToken);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal mengambil daftar file Google Drive (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as {
    files?: Array<{
      id: string;
      name: string;
      mimeType: string;
      size?: string;
      createdTime?: string;
      modifiedTime?: string;
      parents?: string[];
      webViewLink?: string;
      description?: string;
    }>;
  };

  return (data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: Number(f.size || 0),
    createdTime: f.createdTime || f.modifiedTime || '',
    modifiedTime: f.modifiedTime || f.createdTime || '',
    parents: f.parents,
    webViewLink: f.webViewLink,
    description: f.description,
  }));
}

export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  const res = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, accessToken, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    const errText = await res.text();
    throw new Error(`Gagal menghapus file dari Google Drive (${res.status}): ${errText}`);
  }
}

export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
  filename: string
): Promise<void> {
  const res = await driveFetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
    accessToken
  );
  if (!res.ok) {
    throw new Error(`Gagal mengunduh file "${filename}" (${res.status}).`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
