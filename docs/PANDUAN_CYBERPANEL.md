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

### Menghubungkan Repository GitHub dari VPS dengan SSH

Jika repository sudah di-clone menggunakan HTTPS, ubah remote `origin` ke SSH agar update berikutnya menggunakan kunci SSH:

1. Masuk ke VPS sebagai **user Linux yang sama** dengan user yang akan menjalankan `git pull`. Periksa kunci SSH yang tersedia:

   ```bash
   ls -la ~/.ssh
   ```

   Jika belum memiliki kunci Ed25519, buat kunci baru. Jangan menimpa kunci yang sudah digunakan untuk keperluan lain:

   ```bash
   ssh-keygen -t ed25519 -C "cybervault-vps"
   ```

   Tekan Enter untuk lokasi default. Passphrase boleh diisi untuk keamanan tambahan; jika update dijalankan secara manual, passphrase akan diminta saat kunci digunakan.

2. Tampilkan **kunci publik** untuk didaftarkan ke GitHub:

   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```

   Salin seluruh output yang berakhiran `.pub`. Jangan pernah membagikan atau mengunggah file privat `~/.ssh/id_ed25519`.

3. Di GitHub, buka repository **Settings → Deploy keys → Add deploy key**. Beri judul seperti `CyberVault VPS`, tempel kunci publik, dan biarkan **Allow write access** tidak dicentang karena VPS hanya perlu membaca/pull source.

4. Di VPS, masuk ke direktori aplikasi dan periksa remote yang ada:

   ```bash
   cd /home/backup.smkn1temon.sch.id/app
   git remote -v
   ```

   Jika belum ada remote `origin`, tambahkan dengan alamat SSH:

   ```bash
   git remote add origin git@github.com:mazguru/cybervault.git
   ```

   Jika `origin` sudah ada tetapi masih menggunakan HTTPS, ganti URL-nya:

   ```bash
   git remote set-url origin git@github.com:mazguru/cybervault.git
   git remote -v
   ```

   Ganti `OWNER/REPO` dengan pemilik dan nama repository GitHub. Untuk clone baru, gunakan alamat SSH sejak awal:

   ```bash
   cd /home/backup.smkn1temon.sch.id
   git clone -b production git@github.com:mazguru/cybervault.git
   ```

5. Uji autentikasi dan izin baca repository:

   ```bash
   ssh -T git@github.com
   git ls-remote origin
   ```

   GitHub dapat menampilkan pesan bahwa autentikasi berhasil tetapi shell tidak disediakan; itu normal. Pastikan `git ls-remote origin` menampilkan referensi branch tanpa error izin.

Setelah remote SSH siap, update aplikasi dapat dilakukan dengan:

```bash
cd /home/backup.smkn1temon.sch.id/app
git pull origin production
sudo systemctl restart cybervault
```

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

Cara ini menjalankan aplikasi sebagai **root** agar dapat mengakses perintah dan file CyberPanel. Jalankan langkah-langkah berikut melalui SSH. Periksa akun aktif:

```bash
whoami
```

Jika hasilnya `root`, lanjutkan ke langkah berikutnya—tidak perlu menjalankan `sudo -i`. Jika Anda login sebagai user biasa dan memiliki izin sudo, masuk ke shell root dengan `sudo -i`. Jika tidak memiliki izin sudo, gunakan `su -` dan masukkan password root, atau sambungkan SSH langsung sebagai root. Jika sebelumnya menjalankan `su - namauser` dari sesi root, ketik `exit` untuk kembali ke sesi root. Pastikan `whoami` menampilkan `root` sebelum membuat file service. Jangan menambahkan akun ke `sudoers` hanya untuk mengikuti panduan ini.

Jika perintah `cd /home/backup.smkn1temon.sch.id/app` menampilkan `No such file or directory`, aplikasi belum di-clone ke lokasi tersebut. Pastikan website/subdomain sudah dibuat di CyberPanel, lalu periksa direktori home domain:

```bash
ls -ld /home/backup.smkn1temon.sch.id
```

Jika direktori domain tersedia, clone branch `production` ke dalamnya (ganti `OWNER/REPO` dengan repository GitHub Anda; gunakan URL SSH jika SSH GitHub sudah disiapkan):

```bash
cd /home/backup.smkn1temon.sch.id
git clone -b production git@github.com:OWNER/REPO.git app
```

Jika direktori domain tidak ditemukan, periksa nama domain dan lokasi home website yang dibuat CyberPanel. Gunakan lokasi yang benar sebelum melanjutkan; jangan membuat folder pengganti sebelum memastikan konfigurasi website.

Setelah clone selesai, lanjutkan:

```bash
cd /home/backup.smkn1temon.sch.id/app
test -f dist/server.cjs && echo "Bundle server ditemukan"
test -f .env && echo "File .env ditemukan"
command -v node
```

Pastikan kedua pesan file ditemukan muncul. Jika `.env` belum ada, ikuti langkah pembuatan `.env` pada bagian sebelumnya sebelum menjalankan service.

Buat file unit systemd:

```bash
nano /etc/systemd/system/cybervault.service
```

Tempel konfigurasi berikut, lalu simpan (`Ctrl+O`, `Enter`) dan keluar (`Ctrl+X`). Jika path Node.js berbeda, ganti `/usr/bin/node` dengan path yang tadi dicatat.

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

Muat ulang konfigurasi systemd, aktifkan service agar berjalan otomatis saat VPS menyala, lalu mulai:

```bash
systemctl daemon-reload
systemctl enable cybervault
systemctl start cybervault
systemctl status cybervault
```

Pastikan status menunjukkan `active (running)`. Jika service gagal, lihat log untuk mengetahui penyebabnya:

```bash
journalctl -u cybervault -n 100 --no-pager
```

Uji API dari VPS. Perintah ini seharusnya menampilkan respons JSON dengan `"ok":true`:

```bash
curl -fsS http://127.0.0.1:3000/api/health
```

Setelah mengubah file service atau konfigurasi, muat ulang dan restart service:

```bash
systemctl daemon-reload
systemctl restart cybervault
systemctl status cybervault
```

> **Catatan keamanan:** Karena service berjalan sebagai root, aplikasi Node.js juga memiliki hak root. Amankan panel dengan HTTPS, password admin yang kuat, dan batasi akses jaringan ke panel.

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

Panduan lengkap instalasi dan autentikasi rclone pada VPS tanpa browser tersedia di [`PANDUAN_RCLONE.md`](./PANDUAN_RCLONE.md).

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

