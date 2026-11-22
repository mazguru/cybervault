// In-memory only token management (never stored in localStorage or sessionStorage)
let sessionToken: string | null = null;
let driveAccessToken: string | null = null;

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: GoogleTokenResponse) => void;
            error_callback?: (err: { type: string; message?: string }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

export function setDriveToken(token: string | null): void {
  driveAccessToken = token;
}

export function getDriveToken(): string | null {
  return driveAccessToken;
}

export function clearAllTokens(): void {
  sessionToken = null;
  driveAccessToken = null;
}

function waitForGoogleGsi(timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        window.clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        window.clearInterval(timer);
        reject(
          new Error(
            'Layanan Google Identity Services belum termuat. Periksa koneksi internet atau coba muat ulang halaman.'
          )
        );
      }
    }, 100);
  });
}

export async function requestGoogleDriveAccessToken(clientId: string): Promise<string> {
  if (!clientId) {
    throw new Error(
      'Google Client ID belum dikonfigurasi. Tambahkan VITE_GOOGLE_CLIENT_ID pada file .env server.'
    );
  }

  await waitForGoogleGsi();

  return new Promise((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      reject(new Error('Google OAuth client tidak tersedia.'));
      return;
    }

    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope:
        'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(
            new Error(resp.error_description || resp.error || 'Otorisasi Google Drive dibatalkan.')
          );
          return;
        }
        driveAccessToken = resp.access_token;
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        reject(new Error(err.message || `Popup Google OAuth gagal (${err.type}).`));
      },
    });

    tokenClient.requestAccessToken({ prompt: 'select_account' });
  });
}
