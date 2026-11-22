# Panduan Pemasangan & Konfigurasi CyberVault di Website CyberPanel (`smkn1temon.sch.id`)

Panduan ini menjelaskan langkah demi langkah untuk memasang aplikasi **CyberVault** (Mode **100% Mandiri di VPS**, tanpa Firebase) pada server **CyberPanel (OpenLiteSpeed)** untuk domain **`smkn1temon.sch.id`** (disarankan menggunakan subdomain seperti `backup.smkn1temon.sch.id`) dengan dua metode login: **Login Lokal** dan **Login Google Drive**.

---

## Arsitektur Mandiri di VPS CyberPanel

1. **Penyimpanan Permanen Lokal (`data/cybervault-db.json`)**:
   - Konfigurasi server, daftar website CyberPanel, jadwal otomatis, riwayat backup, dan hash password admin lokal disimpan permanen langsung di disk VPS Anda dengan permission file `0600`.
2. **Scheduler Otomatis 24/7 di Backend**:
   - Proses Node.js (`server.ts`) menjalankan loop penjadwalan otomatis secara terus-menerus di server, sehingga jadwal harian/mingguan/bulanan tetap berjalan meskipun browser admin sedang ditutup.
3. **Dua Opsi Login + Koneksi Google Drive**:
   - **Opsi 1 — Login Lokal**: Username & password administrator lokal (diatur saat *Setup Admin Pertama* di UI atau melalui `.env`).
   - **Opsi 2 — Login dengan Google Drive**: Tombol *Sign in with Google Drive* untuk masuk sekaligus mengotorisasi akses Google Drive API dari browser.
   - **Sinkronisasi `rclone` VPS (Direkomendasikan untuk File Besar & Cron Malam)**: Memungkinkan backup terjadwal 24/7 dan tampilan daftar file Google Drive berjalan langsung dari server VPS.

---

## Prasyarat Server

- VPS Linux dengan **CyberPanel** & **OpenLiteSpeed** aktif (`smkn1temon.sch.id`).
- **Node.js v22 LTS** atau lebih baru (`node -v`).
- **systemd** (bawaan Linux) atau **PM2** (`npm install -g pm2`).
- Subdomain yang diarahkan ke IP server CyberPanel, misalnya `backup.smkn1temon.sch.id` (agar website utama `smkn1temon.sch.id` tidak terganggu).

---

## Langkah 1: Buat Website / Subdomain di CyberPanel

1. Masuk ke panel admin CyberPanel (`https://smkn1temon.sch.id:8090`).
2. Buka menu **Websites** &rarr; **Create Website**.
3. Isi rincian berikut:
   - **Domain Name**: `backup.smkn1temon.sch.id` *(atau domain tujuan Anda)*
   - **Email**: `datacenter2@smkn1temon.sch.id`
   - **PHP**: Pilih versi apa saja (mis. PHP 8.2 — hanya untuk kerangka vHost)
   - Centang **SSL** agar sertifikat Let's Encrypt otomatis terpasang.
4. Klik **Create Website**.

---

## Langkah 2: Clone Branch `production` (Sudah Ter-build, Tanpa `npm install`)

Masuk ke server melalui SSH, lalu masuk ke direktori website yang baru dibuat:

```bash
cd /home/backup.smkn1temon.sch.id
```

### Cara Cepat (Direkomendasikan — Dari Branch `production` hasil `deploy.sh`)

Jika Anda sudah menjalankan `./deploy.sh` dari Laragon/komputer lokal, branch **`production`** di GitHub sudah berisi folder `dist/` dan bundle server `dist/server.cjs` yang **siap dijalankan langsung tanpa `npm install` maupun `npm run build` di server**:

```bash
git clone -b production <URL_REPO_GITHUB_ANDA> app
cd app
```

*(Untuk update di kemudian hari setelah push baru dari Laragon, cukup jalankan `git pull && systemctl restart cybervault` tanpa install ulang!)*

### Cara Alternatif (Jika Clone Branch `main` / Source Mentah)

Jika Anda tidak memakai branch `production` dan men-clone branch `main`, baru jalankan build manual:

```bash
git clone <URL_REPO_GITHUB_ANDA> app
cd app
npm install
npm run build:prod
```

---

### Konfigurasi File `.env` di Server

Buat file `.env` berdasarkan `.env.example`:

```bash
cp .env.example .env
nano .env
```

Isi variabel sesuai kebutuhan Anda (semua variabel bersifat opsional kecuali jika Anda ingin mengunci dari `.env`):

```env
PORT=3000
NODE_ENV=production

# Opsional: Jika dikosongkan, halaman login pertama akan menampilkan form
# "Setup Admin Pertama" untuk membuat username & password admin langsung dari UI.
ADMIN_USERNAME=admin
ADMIN_PASSWORD=GantiDenganPasswordKuatMinimal12Karakter

# Opsional: Batasi email Google Drive yang boleh masuk lewat tombol Google Login
ALLOWED_GOOGLE_EMAILS=datacenter2@smkn1temon.sch.id

# Opsional: Nama remote rclone di VPS (default: gdrive)
RCLONE_REMOTE=gdrive

# Opsional: Google OAuth 2.0 Client ID untuk tombol "Login dengan Google Drive"
VITE_GOOGLE_CLIENT_ID=851865332140-e6pkpcoras5um4vh67sg77d1g05ldde7.apps.googleusercontent.com
```

> **Catatan Keamanan:** Jangan pernah membagikan file `.env` atau folder `data/` ke repositori publik. Folder `data/` sudah dimasukkan ke `.gitignore`.

---

## Langkah 3: Jalankan Server Node.js di Port 3000

### Opsi A — Menggunakan Systemd (Direkomendasikan untuk Akses CyberPanel CLI Penuh)

Agar aplikasi bisa menjalankan `cyberpanel listWebsitesJson` (mengambil daftar website otomatis) dan `cyberpanel createBackup` secara langsung dari UI, buat file `/etc/systemd/system/cybervault.service`:

```ini
[Unit]
Description=CyberVault Backup Panel (SMKN 1 Temon)
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/backup.smkn1temon.sch.id/app
EnvironmentFile=/home/backup.smkn1temon.sch.id/app/.env
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node /home/backup.smkn1temon.sch.id/app/dist/server.cjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Aktifkan dan jalankan service:

```bash
systemctl daemon-reload
systemctl enable cybervault
systemctl start cybervault
systemctl status cybervault
```

Pastikan server merespons di port `3000`:

```bash
curl http://127.0.0.1:3000/api/health
```

### Opsi B — Menggunakan PM2

```bash
cd /home/backup.smkn1temon.sch.id/app
NODE_ENV=production PORT=3000 pm2 start dist/server.cjs --name cybervault
pm2 save
pm2 startup
```

---

## Langkah 4: Konfigurasi Reverse Proxy OpenLiteSpeed di CyberPanel

Agar `https://backup.smkn1temon.sch.id` meneruskan trafik ke Node.js di port `3000`:

1. Di CyberPanel, buka **Websites** &rarr; **List Websites** &rarr; klik **Manage** pada `backup.smkn1temon.sch.id`.
2. Buka menu **vHost Conf**.
3. Tambahkan blok berikut di konfigurasi vHost:

```apacheconf
extprocessor cybervault_node {
  type                    proxy
  address                 127.0.0.1:3000
  maxConns                100
  pcKeepAliveTimeout      60
  initTimeout             60
  retryTimeout            0
  respBuffer              0
}

context / {
  type                    proxy
  handler                 cybervault_node
  addDefaultCharset       off
}
```

> Jika di dalam `vHost Conf` sudah ada blok `context / { ... }`, ganti/gabungkan dengan `type proxy` dan `handler cybervault_node` di atas agar tidak terjadi duplikasi `context /`.

4. Klik **Save**, lalu restart OpenLiteSpeed melalui SSH:

```bash
systemctl restart lsws
```

---

## Langkah 5: Mengaktifkan Tombol "Login dengan Google Drive" di Domain Sendiri (Opsional)

Tanpa langkah ini pun, **Login Lokal** dan **`rclone` VPS** sudah langsung bisa dipakai. Namun jika Anda ingin memakai tombol **Sign in with Google Drive** langsung dari browser di `https://backup.smkn1temon.sch.id`:

1. Buka **Google Cloud Console** (`https://console.cloud.google.com`) &rarr; **APIs & Services** &rarr; **Credentials**.
2. Edit **OAuth 2.0 Client ID** Anda (atau buat tipe *Web application* baru jika memakai project Google Cloud sekolah sendiri, lalu pasang ID-nya di `VITE_GOOGLE_CLIENT_ID`).
3. Pastikan **Google Drive API** sudah berstatus *Enabled* di menu **Enabled APIs & services**.
4. Pada bagian **Authorized JavaScript origins**, tambahkan:
   - `https://smkn1temon.sch.id`
   - `https://backup.smkn1temon.sch.id`
5. Klik **Save**. Tidak ada pengaturan Firebase apa pun yang diperlukan.

---

## Langkah 6: Pasang `rclone` untuk Backup Otomatis 24/7 & Arsip Besar (> 45 MB)

Agar scheduler backend 24/7 dapat mengunggah arsip website besar secara otomatis tanpa browser terbuka:

1. Install `rclone` di server CyberPanel:
   ```bash
   curl https://rclone.org/install.sh | sudo bash
   rclone config
   ```
   - Pilih `n` (*New remote*), beri nama `gdrive` (harus sama dengan `RCLONE_REMOTE` di `.env`).
   - Pilih tipe `drive` (*Google Drive*) dan ikuti otorisasi akun `datacenter2@smkn1temon.sch.id`.
2. Uji koneksi dari SSH:
   ```bash
   rclone lsd gdrive:
   ```
3. Setelah `gdrive:` aktif, panel **CyberVault** otomatis mendeteksinya:
   - Scheduler backend 24/7 akan langsung mengunggah arsip ke `gdrive:CyberPanel-Backups`.
   - Menu **File Google Drive** di UI tetap bisa menampilkan, memfilter, dan menghapus arsip meskipun Anda masuk memakai **Login Lokal**.

---

## Langkah 7: Setup Awal Setelah Website Dibuka

1. Buka `https://backup.smkn1temon.sch.id` di browser.
2. Pilih cara masuk:
   - **Tab Login Lokal**: Jika `ADMIN_PASSWORD` di `.env` dikosongkan, isi form **Setup Admin Pertama** untuk mengklaim username & password admin Anda. Setelah dibuat, form tersebut otomatis terkunci menjadi form login biasa.
   - **Tab Google Drive**: Klik **Sign in with Google Drive** untuk masuk menggunakan akun Google operator (`datacenter2@smkn1temon.sch.id`).
3. Jendela **Setup Awal Panel Backup CyberPanel** akan muncul otomatis:
   - **Langkah 1**: Klik **Ambil dari CyberPanel** untuk menarik seluruh daftar website di server `smkn1temon.sch.id`.
   - **Langkah 2**: Pastikan koneksi Google Drive (`OAuth` atau `rclone VPS`) dan folder `CyberPanel-Backups` sudah siap.
   - **Langkah 3**: Tinjau jadwal otomatis 24/7 dan retensi arsip.
   - **Langkah 4**: Tinjau status host server dan mulai gunakan **Backup Sekarang**.

---

## Langkah 8: Penanganan Website Laravel di Luar `public_html`

CyberVault mendukung proyek **Laravel** meskipun `docRoot` tidak berada di `/home/<domain>/public_html`:

1. **Laravel di dalam `/home/<domain>/nama-proyek` (mis. `/home/ppdb.smkn1temon.sch.id/laravel/public`)**:
   - Perintah native `cyberpanel createBackup` otomatis mem-backup seluruh direktori `/home/<domain>/` termasuk `.env`, `app/`, `storage/`, `public/`, dan database MariaDB.
   - Saat Anda klik **Sinkronkan CyberPanel**, CyberVault membaca `docRoot` dari `/usr/local/lsws/conf/vhosts/<domain>/vhost.conf`, mengecek folder parent-nya (`artisan` / `composer.json`), dan otomatis menampilkan path root proyek Laravel di panel.
2. **Laravel di luar `/home/<domain>/` (mis. `/var/www/siakad` atau `/opt/elearning`)**:
   - Karena `cyberpanel createBackup` bawaan hanya mem-backup `/home/<domain>/`, isi path root proyek pada menu **Konfigurasi Server** untuk domain tersebut.
   - CyberVault (dan script `.sh` yang dihasilkan) akan otomatis membuat arsip tambahan `custom-<domain>-*.tar.gz` untuk folder tersebut, dengan opsi mengecualikan `vendor/` dan `node_modules/` agar ukuran backup ringan dan cepat diunggah ke Google Drive.

