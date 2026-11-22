import { useState } from 'react';
import {
  Clock,
  Eye,
  EyeOff,
  FolderGit2,
  HardDrive,
  KeyRound,
  Lock,
  Moon,
  Server,
  ShieldCheck,
  Sun,
  UserPlus,
} from 'lucide-react';
import { requestGoogleDriveAccessToken, setDriveToken, setSessionToken } from '../lib/auth';
import type { AuthStatus, AuthUser } from '../types/backup';

interface LoginPageProps {
  authStatus: AuthStatus;
  isDark: boolean;
  onToggleTheme: () => void;
  onAuthenticated: (user: AuthUser, sessionToken: string, driveToken: string | null) => void;
  onBootstrapComplete: () => void;
}

export function LoginPage({
  authStatus,
  isDark,
  onToggleTheme,
  onAuthenticated,
  onBootstrapComplete,
}: LoginPageProps) {
  const [loginTab, setLoginTab] = useState<'local' | 'google'>('local');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLocalBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (password.length < 8) {
      setErrorMsg('Password admin minimal 8 karakter.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Konfirmasi password tidak cocok.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = (await res.json()) as { token?: string; user?: AuthUser; error?: string };
      if (!res.ok || !data.token || !data.user) {
        throw new Error(data.error || 'Gagal membuat akun admin pertama.');
      }
      setSessionToken(data.token);
      onBootstrapComplete();
      onAuthenticated(data.user, data.token, null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat akun admin.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = (await res.json()) as { token?: string; user?: AuthUser; error?: string };
      if (!res.ok || !data.token || !data.user) {
        throw new Error(data.error || 'Username atau password salah.');
      }
      setSessionToken(data.token);
      onAuthenticated(data.user, data.token, null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Autentikasi gagal.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleDriveLogin = async () => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const accessToken = await requestGoogleDriveAccessToken(authStatus.googleClientId);
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      });
      const data = (await res.json()) as { token?: string; user?: AuthUser; error?: string };
      if (!res.ok || !data.token || !data.user) {
        setDriveToken(null);
        throw new Error(data.error || 'Verifikasi akun Google gagal.');
      }
      setSessionToken(data.token);
      setDriveToken(accessToken);
      onAuthenticated(data.user, data.token, accessToken);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Login Google Drive gagal. Pastikan popup tidak diblokir browser.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-[#f4f7fb] dark:bg-slate-950 transition-colors">
      {/* Left Royal-Blue Brand & Feature Panel */}
      <div className="relative hidden lg:flex lg:col-span-6 bg-gradient-to-br from-[#1d63ed] via-[#0c45b6] to-[#062d85] overflow-hidden flex-col justify-between p-12 xl:p-16 text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -right-24 w-96 h-96 rounded-full bg-white/8 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-blue-300/10 blur-3xl"
        />

        {/* Brand Identity */}
        <div className="relative z-10 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-white text-[#0c45b6] shadow-md flex items-center justify-center shrink-0">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100/85">
              SMKN 1 TEMON
            </div>
            <div className="text-base font-bold tracking-tight text-white">
              CyberVault Backup
            </div>
          </div>
        </div>

        {/* Hero Copy & 3 Key Capabilities */}
        <div className="relative z-10 max-w-lg my-auto py-10 space-y-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-200/90">
            DATA CENTER · CYBERPANEL
          </div>

          <h1 className="text-4xl xl:text-[42px] font-bold leading-[1.12] tracking-tight text-white">
            Server sekolah, tercadangkan dalam satu layar.
          </h1>

          <p className="text-blue-100/85 text-[15px] leading-relaxed">
            Kelola arsip website CyberPanel, proyek Laravel di luar <span className="font-mono text-white/95">public_html</span>, database MariaDB, dan unggahan Google Drive dari satu konsol VPS yang mandiri.
          </p>

          <div className="pt-6 border-t border-white/15 space-y-3.5">
            <div className="flex items-center gap-3.5 text-sm text-blue-50">
              <span className="w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-blue-100" />
              </span>
              <span>Jadwal backup otomatis 24/7 langsung di server VPS</span>
            </div>
            <div className="flex items-center gap-3.5 text-sm text-blue-50">
              <span className="w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                <FolderGit2 className="w-4 h-4 text-blue-100" />
              </span>
              <span>Deteksi root proyek Laravel &amp; domain CyberPanel kustom</span>
            </div>
            <div className="flex items-center gap-3.5 text-sm text-blue-50">
              <span className="w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-blue-100" />
              </span>
              <span>Akses aman via Admin Lokal VPS atau otorisasi Google Drive</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-xs text-blue-200/75 font-mono">
          smkn1temon.sch.id · Standalone VPS Console
        </div>
      </div>

      {/* Right Authentication Area */}
      <div className="lg:col-span-6 flex flex-col justify-between p-6 sm:p-10 bg-[#f4f7fb] dark:bg-slate-950">
        {/* Top Bar with Theme Toggle & Mobile Logo */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1d63ed] to-[#0c45b6] flex items-center justify-center shadow-xs">
              <Server className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#1d63ed] dark:text-blue-400">
                SMKN 1 TEMON
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white leading-none">
                CyberVault
              </div>
            </div>
          </div>
          <div className="hidden lg:block" />

          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-xs transition-colors cursor-pointer"
          >
            {isDark ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Mode terang</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-[#1d63ed]" />
                <span>Mode gelap</span>
              </>
            )}
          </button>
        </div>

        {/* Centered Header + Card */}
        <div className="w-full max-w-md mx-auto my-auto py-8">
          <div className="text-center mb-6">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#1d63ed] dark:text-blue-400">
              DATA CENTER SMKN 1 TEMON
            </div>
            <h2 className="text-2xl sm:text-[26px] font-bold text-slate-900 dark:text-white tracking-tight mt-1.5">
              Masuk ke akun
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              Gunakan akun administrator lokal server atau akun Google Drive Anda.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xl shadow-slate-200/60 dark:shadow-none p-7 sm:p-8">
            {/* 2-Option Segmented Switch */}
            <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setLoginTab('local');
                  setErrorMsg(null);
                }}
                className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  loginTab === 'local'
                    ? 'bg-white dark:bg-slate-900 text-[#0c45b6] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                Login Lokal
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginTab('google');
                  setErrorMsg(null);
                }}
                className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  loginTab === 'google'
                    ? 'bg-white dark:bg-slate-900 text-[#0c45b6] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <HardDrive className="w-3.5 h-3.5" />
                Google Drive
              </button>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="mt-5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/70 text-xs text-red-700 dark:text-red-300 leading-relaxed"
              >
                {errorMsg}
              </div>
            )}

            {loginTab === 'local' ? (
              authStatus.needsFirstRunSetup ? (
                <form onSubmit={handleLocalBootstrap} className="mt-6 space-y-4">
                  <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                    <strong>Setup Admin Pertama:</strong> Buat username dan password administrator lokal. Kredensial di-hash aman di server VPS Anda.
                  </div>

                  <div>
                    <label
                      htmlFor="setup-username"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Username admin
                    </label>
                    <input
                      id="setup-username"
                      type="text"
                      required
                      minLength={3}
                      maxLength={32}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/15"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="setup-password"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Kata sandi baru (min. 8 karakter)
                    </label>
                    <div className="relative">
                      <input
                        id="setup-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Masukkan password kuat"
                        className="w-full pl-3.5 pr-10 py-2.5 text-sm bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/15"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="setup-confirm"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Konfirmasi kata sandi
                    </label>
                    <div className="relative">
                      <input
                        id="setup-confirm"
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Ulangi kata sandi"
                        className="w-full pl-3.5 pr-10 py-2.5 text-sm bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/15"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        aria-label={showConfirmPassword ? 'Sembunyikan konfirmasi' : 'Lihat konfirmasi'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-gradient-to-r from-[#1d63ed] to-[#0c45b6] hover:from-[#1755d1] hover:to-[#0a3a99] disabled:opacity-60 rounded-xl shadow-sm transition-all cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    {isLoading ? 'Menyimpan Akun Admin...' : 'SIMPAN & MASUK'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleLocalLogin} className="mt-6 space-y-4">
                  <div>
                    <label
                      htmlFor="login-username"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Username admin
                    </label>
                    <input
                      id="login-username"
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/15"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Kata sandi
                    </label>
                    <div className="relative">
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Masukkan kata sandi"
                        className="w-full pl-3.5 pr-10 py-2.5 text-sm bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/15"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-gradient-to-r from-[#1d63ed] to-[#0c45b6] hover:from-[#1755d1] hover:to-[#0a3a99] disabled:opacity-60 rounded-xl shadow-sm transition-all cursor-pointer mt-2"
                  >
                    <Lock className="w-4 h-4" />
                    {isLoading ? 'MEMVERIFIKASI...' : 'MASUK'}
                  </button>
                </form>
              )
            ) : (
              <div className="mt-6 space-y-4">
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Masuk sekaligus menghubungkan izin Google Drive untuk melihat daftar arsip, ukuran file, waktu upload, dan mengunggah hasil backup secara langsung.
                </p>

                <button
                  type="button"
                  onClick={() => void handleGoogleDriveLogin()}
                  disabled={isLoading || !authStatus.googleClientId}
                  className="gsi-material-button"
                >
                  <div className="gsi-material-button-state" />
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon">
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        style={{ display: 'block' }}
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">
                      {isLoading ? 'Menghubungkan Google Drive...' : 'Sign in with Google Drive'}
                    </span>
                  </div>
                </button>

                {!authStatus.googleClientId && (
                  <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3">
                    <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> belum dikonfigurasi di{' '}
                    <code className="font-mono">.env</code>. Gunakan tab <strong>Login Lokal</strong> untuk masuk ke panel.
                  </p>
                )}
              </div>
            )}

            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Konfigurasi, jadwal 24/7, dan riwayat tersimpan permanen di VPS sekolah. Setelah masuk, panel akan memandu setup awal CyberPanel &amp; Drive.
              </span>
            </div>
          </div>

          <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-6">
            © 2026 Tim IT SMKN 1 Temon. All rights reserved.
          </p>
        </div>

        <div className="h-2" />
      </div>
    </div>
  );
}
