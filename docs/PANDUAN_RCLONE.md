# Panduan rclone Google Drive di VPS CyberPanel

Panduan ini menyiapkan remote rclone agar CyberVault dapat mengunggah backup terjadwal ke Google Drive, meskipun VPS tidak memiliki browser. Pada pemasangan ini service CyberVault berjalan sebagai `root`, jadi konfigurasi rclone harus dibuat dengan akun root yang sama.

## 1. Pasang rclone

Periksa apakah rclone sudah tersedia:

```bash
rclone version
```

Jika perintah tidak ditemukan, jalankan sebagai root:

```bash
curl https://rclone.org/install.sh | bash
```

## 2. Siapkan OAuth Google

Di Google Cloud Console:

1. Pilih atau buat project, lalu aktifkan **Google Drive API**.
2. Siapkan **OAuth consent screen**. Pilih **Internal** jika akun Drive dikelola Google Workspace organisasi yang memiliki project tersebut. Jika tidak, pilih **External** dan tambahkan akun Drive sebagai **Test user**.
3. Jika aplikasi External masih berstatus **Testing**, token refresh dapat kedaluwarsa setelah 7 hari. Untuk backup 24/7 jangka panjang, gunakan Internal bila memenuhi syarat atau selesaikan publikasi/verifikasi OAuth sebelum mengandalkannya.
4. Buat OAuth Client ID bertipe **Desktop app**. Simpan Client ID dan Client Secret untuk dimasukkan langsung pada prompt rclone. Jangan kirim atau tempelkan keduanya ke chat.

> **Penting:** Jika Client Secret pernah dibagikan atau ditempel ke chat, jangan gunakan kembali. Rotasi secret tersebut atau buat OAuth Client baru.

## 3. Buat remote sebagai root

Pastikan prompt shell menunjukkan root, lalu mulai konfigurasi:

```bash
rclone config
```

Ikuti prompt berikut:

1. Pilih `n` untuk membuat remote baru.
2. Beri nama `gdrive`, lalu pilih storage `drive`.
3. Masukkan Client ID dan Client Secret Desktop app yang telah dibuat.
4. Pilih scope `1` (`drive`) agar rclone dapat mengunggah, membaca, dan menghapus arsip untuk retensi.
5. Kosongkan `service_account_file`.
6. Pilih `n` untuk advanced config dan `n` untuk auto config karena VPS tidak memiliki browser.
7. Pada prompt `config_token>`, rclone menampilkan perintah `rclone authorize ...`. Jalankan perintah itu di komputer lokal yang memiliki browser dan rclone dengan versi yang sama. Login ke akun Drive yang akan menyimpan backup, izinkan akses, lalu tempel hasil token JSON **langsung ke prompt VPS**.
8. Jika ditanya apakah remote menggunakan Shared Drive, pilih `n`, kecuali backup memang akan disimpan di Shared Drive.

Perintah `rclone authorize` berisi data OAuth dan hasilnya adalah token akses. Jalankan dan tempelkan hanya di terminal yang sesuai; jangan bagikan keduanya.

Setelah konfigurasi selesai, batasi izin file konfigurasi rclone:

```bash
chmod 600 /root/.config/rclone/rclone.conf
```

## 4. Uji koneksi dan hubungkan ke CyberVault

Uji remote sebagai root:

```bash
rclone lsd gdrive:
```

Jika berhasil, pastikan `.env` CyberVault berisi nama remote yang sama:

```env
RCLONE_REMOTE=gdrive
```

Setelah mengubah `.env`, restart service:

```bash
systemctl restart cybervault
```

Scheduler backend kemudian dapat mengunggah backup ke `gdrive:CyberPanel-Backups`. Menu **File Google Drive** juga dapat menggunakan remote tersebut meskipun operator masuk memakai **Login Lokal**.
