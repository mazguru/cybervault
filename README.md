# CyberVault — Panel Konfigurasi Backup CyberPanel Mandiri (`smkn1temon.sch.id`)

CyberVault adalah aplikasi web full-stack **100% mandiri di VPS CyberPanel** (React + Vite + Express + Penyimpanan Permanen Server + Google Drive API / `rclone`) untuk mengelola backup server **CyberPanel** secara terpusat tanpa ketergantungan Firebase.

## Fitur Utama

1. **Dua Opsi Login Terproteksi**:
   - **Login Lokal (Username & Password)**: Di-hash dengan `scrypt` + *salt* di server (`data/cybervault-db.json`) atau dikonfigurasi melalui `ADMIN_USERNAME` & `ADMIN_PASSWORD` di `.env`. Jika belum diatur, form *Setup Admin Pertama* akan muncul otomatis dan langsung terkunci begitu kredensial dibuat.
   - **Login dengan Google Drive**: Autentikasi melalui Google OAuth yang diverifikasi oleh backend sekaligus langsung memberikan akses ke **Google Drive API**. Operator yang masuk via Login Lokal juga dapat menghubungkan Google Drive kapan saja dari sidebar atau wizard.
2. **Setup Awal Interaktif**: Panduan 4 langkah otomatis saat pertama kali masuk untuk menyinkronkan daftar website CyberPanel, menghubungkan Google Drive (`OAuth` atau `rclone`), meninjau jadwal otomatis 24/7, dan memeriksa kesiapan pemasangan di VPS.
3. **Daftar Website yang Di-Backup**: Menampilkan daftar website CyberPanel beserta pilihan website yang disertakan, serta tombol **Sinkronkan CyberPanel** (`cyberpanel listWebsitesJson` / `/usr/local/lsws/conf/vhosts`) otomatis saat dijalankan di server CyberPanel.
4. **Tombol "Backup Sekarang" Real-Time**: Menampilkan *progress bar* dan terminal log proses secara langsung (*Server-Sent Events*) mulai dari pemeriksaan/eksekusi `cyberpanel createBackup`, pengemasan `.tar.gz`, hingga pengunggahan ke Google Drive (`OAuth` maupun `rclone`) atau penyimpanan snapshot lokal (`data/backups/`).
5. **Pengaturan Jadwal Otomatis Permanen 24/7**: Konfigurasi frekuensi (*Harian*, *Mingguan*, *Bulanan*, *Per 6 Jam*, *Per 12 Jam*), jam eksekusi, zona waktu (`WIB`/`WITA`/`WIT`/`UTC`), serta kebijakan retensi (*auto-prune*) yang tersimpan permanen di `data/cybervault-db.json` dan dijalankan langsung oleh scheduler backend 24/7 meskipun browser ditutup.
6. **Manajemen File Google Drive**: Melihat kuota penyimpanan, daftar arsip backup lengkap dengan ukuran file dan waktu upload, tombol unduh, serta tombol hapus (tunggal/massal) dengan dialog konfirmasi—mendukung mode **Google Drive OAuth** maupun **rclone VPS**.

## Panduan Pengembangan & Pemasangan

- **Pengembangan Lokal di Laragon (Windows)**: [`docs/PANDUAN_LARAGON.md`](docs/PANDUAN_LARAGON.md)
- **Pemasangan di VPS CyberPanel (`smkn1temon.sch.id`)**: [`docs/PANDUAN_CYBERPANEL.md`](docs/PANDUAN_CYBERPANEL.md)

## Menjalankan Secara Lokal (Development)

```bash
npm install
npm run dev
```

Aplikasi berjalan pada port `3000` (`http://localhost:3000`).

## Build & Deploy ke GitHub untuk CyberPanel (Tanpa `npm install` di VPS)

Dari terminal Laragon / Git Bash:

```bash
bash deploy.sh "pesan commit"
```

Pada repositori Git baru yang belum memiliki commit, pastikan branch source (mis. `main`) dan remote `origin` sudah dibuat. Skrip akan membuat commit source pertama dari perubahan yang ada sebelum melakukan push. Jika Git belum memiliki identitas commit, atur `git config user.name` dan `git config user.email` terlebih dahulu.

Script `deploy.sh` mem-build frontend (`dist/`) dan bundle server mandiri (`dist/server.cjs`), lalu mem-push hasilnya ke branch `production` di GitHub. Di VPS CyberPanel, Anda cukup melakukan:

```bash
git clone -b production <URL_REPO_GITHUB_ANDA> app
cd app
NODE_ENV=production node dist/server.cjs
```
