# Panduan Pengembangan Lokal CyberVault di Laragon (Windows)

Panduan ini ditujukan untuk mengembangkan, menyesuaikan tampilan/fitur, dan menguji aplikasi **CyberVault (`smkn1temon.sch.id`)** secara lokal di komputer Windows menggunakan **Laragon** sebelum di-push ke GitHub dan dipasang ke VPS CyberPanel.

---

## 1. Prasyarat di Laragon

1. **Laragon** terpasang di Windows (umumnya di `C:\laragon`).
2. **Node.js v22 LTS atau lebih baru** & **npm**:
   - Buka **Laragon** &rarr; klik tombol **Terminal**.
   - Jalankan perintah berikut untuk mengecek versi Node.js:
     ```bash
     node -v
     npm -v
     ```
   - Jika versi Node.js bawaan Laragon masih di bawah `v20` / `v22`:
     1. Unduh Node.js v22 LTS (format `.zip` Windows 64-bit) dari situs resmi `https://nodejs.org`.
     2. Ekstrak ke folder `C:\laragon\bin\nodejs\node-v22.x.x-win-x64`.
     3. Di aplikasi Laragon, klik kanan &rarr; **Node.js** &rarr; pilih versi `node-v22` tersebut, lalu buka ulang **Laragon Terminal**.
3. **Git** (sudah termasuk dalam Laragon Full; pastikan `git --version` berfungsi).

---

## 2. Persiapan Proyek & Instalasi Dependensi

Simpan folder proyek di dalam direktori Laragon, misalnya `C:\laragon\www\cybervault`:

```bash
cd /c/laragon/www/cybervault
npm install
```

*(Perintah `npm install` hanya perlu dijalankan di lingkungan pengembangan Laragon ini. Nantinya saat deploy ke VPS CyberPanel melalui branch `production` dari `deploy.sh`, VPS tidak perlu lagi menjalankan `npm install` atau `npm run build`.)*

---

## 3. Konfigurasi File `.env` Lokal

Salin `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

Buka file `.env` dan sesuaikan untuk pengembangan lokal di Laragon:

```env
PORT=3000

# Opsional: Kosongkan ADMIN_PASSWORD jika ingin mengetes form "Setup Admin Pertama" di browser,
# atau isi langsung agar login lokal langsung aktif.
ADMIN_USERNAME=admin
ADMIN_PASSWORD=

# Opsional: Batasi email Google yang diizinkan untuk Login Google Drive
ALLOWED_GOOGLE_EMAILS=datacenter2@smkn1temon.sch.id

# Client ID OAuth 2.0 untuk mengetes tombol "Sign in with Google Drive"
VITE_GOOGLE_CLIENT_ID=851865332140-e6pkpcoras5um4vh67sg77d1g05ldde7.apps.googleusercontent.com
```

### Agar Tombol "Sign in with Google Drive" Jalan di `localhost:3000`
1. Buka **Google Cloud Console** &rarr; **APIs & Services** &rarr; **Credentials**.
2. Edit **OAuth 2.0 Client ID** Anda.
3. Pada **Authorized JavaScript origins**, pastikan tercantum:
   - `http://localhost:3000`
   *(Jangan lupa tetap mencantumkan `https://smkn1temon.sch.id` dan `https://backup.smkn1temon.sch.id` untuk server produksi).*

---

## 4. Menjalankan Server Development di Laragon

Di **Laragon Terminal**, jalankan:

```bash
npm run dev
```

Terminal akan menampilkan:
```text
CyberVault standalone server listening on http://0.0.0.0:3000
```

Buka browser dan akses:
- **`http://localhost:3000`**

Perubahan pada file React (`src/`) dapat langsung dilihat setelah *refresh* browser, dan perubahan pada `server.ts` bisa diuji dengan menghentikan (`Ctrl + C`) lalu menjalankan `npm run dev` kembali.

---

## 5. (Opsional) Akses Melalui Domain VirtualHost Laragon (`cybervault.test`)

Jika Anda ingin mengakses aplikasi lewat URL seperti `http://cybervault.test` via Apache/Nginx di Laragon:

- **Apache** (`C:\laragon\etc\apache2\sites-enabled\auto.cybervault.test.conf`):
  Aktifkan `mod_proxy` dan `mod_proxy_http` di `httpd.conf`, lalu tambahkan di dalam `<VirtualHost *:80>`:
  ```apacheconf
  ProxyPreserveHost On
  ProxyPass / http://127.0.0.1:3000/
  ProxyPassReverse / http://127.0.0.1:3000/
  ```
- **Nginx** (`C:\laragon\etc\nginx\sites-enabled\auto.cybervault.test.conf`):
  ```nginx
  location / {
      proxy_pass http://127.0.0.1:3000;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
      proxy_set_header Host $host;
  }
  ```

> **Catatan:** Google OAuth menolak origin `http://*.test` tanpa HTTPS tepercaya, jadi untuk mengetes **Login Google Drive** di Laragon tetap disarankan membuka **`http://localhost:3000`**.

---

## 6. Perbedaan Perilaku di Laragon (Windows) vs VPS CyberPanel (Linux)

| Fitur | Di Laragon (Windows) | Di VPS CyberPanel (Linux) |
| :--- | :--- | :--- |
| **Login Lokal & Google Drive** | Berjalan penuh | Berjalan penuh |
| **Database (`data/cybervault-db.json`)** | Tersimpan di folder `data/` lokal | Tersimpan di folder `data/` VPS |
| **Backup Sekarang & Progress/Log** | Mengemas manifest, vHost snapshot, & upload ke Google Drive / `data/backups/` | Juga memanggil `cyberpanel createBackup` & menyinkronkan arsip native |
| **Sinkronkan CyberPanel** | Memberi informasi bahwa host bukan Linux CyberPanel | Membaca otomatis dari `cyberpanel listWebsitesJson` / vHosts OpenLiteSpeed |
| **Jadwal Otomatis 24/7** | Berjalan selama `npm run dev` aktif | Berjalan 24/7 sebagai service `systemd` |

> Untuk mereset akun admin lokal atau konfigurasi saat testing di Laragon, cukup hapus file `data/cybervault-db.json` lalu restart `npm run dev`.

---

## 7. Build & Push ke GitHub (`deploy.sh`)

Setelah selesai mengembangkan di Laragon, Anda dapat mem-build versi siap pakai sekaligus mendorongnya ke GitHub menggunakan `./deploy.sh`.

### Persiapan GitHub (Cukup Sekali)
Jika folder belum terhubung ke repository GitHub Anda, jalankan di **Laragon Terminal** (atau **Git Bash**):

```bash
git init
git branch -M main
git remote add origin https://github.com/USERNAME_ANDA/cybervault-backup.git
```

### Menjalankan Deploy ke GitHub
Jalankan dari Laragon Terminal (pastikan berada di Git Bash / bash bawaan Laragon):

```bash
bash deploy.sh "update tampilan dan konfigurasi backup"
```

Script `deploy.sh` akan otomatis melakukan 5 hal:
1. Memastikan dependensi lokal lengkap (`npm install` jika belum ada).
2. Menjalankan pengecekan TypeScript (`npm run lint`).
3. Mem-build frontend (`dist/`) dan membundel backend menjadi **1 file mandiri (`dist/server.cjs`)** menggunakan `npm run build:prod`.
4. Melakukan `commit` & `push` source code ke branch `main`.
5. Mengemas **hanya file siap produksi** (`dist/`, `dist/server.cjs`, `package.json`, `.env.example`, `docs/`, `README.md`) dan mem-push ke branch **`production`** di GitHub.

### Memasang Hasil Build di VPS CyberPanel (Tanpa `npm install` & Tanpa Build)
Di VPS CyberPanel (`smkn1temon.sch.id`), Anda cukup mengambil branch **`production`**:

- **Pemasangan pertama kali:**
  ```bash
  git clone -b production https://github.com/USERNAME_ANDA/cybervault-backup.git /home/backup.smkn1temon.sch.id/app
  ```
- **Update berikutnya setelah Anda menjalankan `deploy.sh` dari Laragon:**
  ```bash
  cd /home/backup.smkn1temon.sch.id/app
  git pull
  systemctl restart cybervault
  ```

Lihat langkah lengkap konfigurasi service dan reverse proxy OpenLiteSpeed di [`docs/PANDUAN_CYBERPANEL.md`](PANDUAN_CYBERPANEL.md).
