# Menjalankan & Membangun POS Sumur Yacob

Dua hal yang berbeda, jangan tertukar:

| Tujuan | Di mana | Hasil |
| --- | --- | --- |
| **Ngoding sehari-hari** | MacBook (lokal) | window app macOS, hot reload |
| **Installer untuk client** | GitHub Actions | `.exe` Windows |

Target client adalah **Windows**. macOS hanya dipakai untuk ngoding — installer
Windows tidak bisa dan tidak perlu dibuat dari Mac.

---

## 1. Menjalankan app di MacBook (development)

Tauri mengkompilasi backend Rust, jadi Rust harus terpasang. Sekali saja:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Terima pilihan default (tekan Enter), lalu tutup dan buka ulang Terminal — atau:

```bash
source "$HOME/.cargo/env"
```

Verifikasi:

```bash
rustc --version    # mis. rustc 1.8x.x
```

Xcode Command Line Tools juga dibutuhkan sebagai linker. Cek dulu, biasanya
sudah ada:

```bash
xcode-select -p || xcode-select --install
```

Setelah itu, tiap kali mau ngoding:

```bash
cd pos-app
npm install        # sekali di awal
npm run tauri dev
```

Kompilasi Rust **pertama kali** memakan ~5-10 menit. Setelah itu window app
langsung muncul. Run berikutnya hitungan detik karena `target/` sudah terisi.

Edit file di `src/` → Vite langsung me-refresh window tanpa kompilasi ulang.
Kompilasi ulang hanya terjadi kalau kamu mengubah kode Rust di `src-tauri/`.

### Kalau cuma mau lihat tampilan (tanpa Rust)

```bash
cd pos-app && npm run dev
```

Buka `http://localhost:1420`. **Terbatas:** SQLite, backup, dan semua
`invoke()` ke Rust tidak akan jalan — ini cuma untuk mengatur layout/CSS.

---

## 2. Membuat installer Windows (rilis)

Dijalankan oleh GitHub Actions di runner Windows asli. Tidak perlu PC Windows,
tidak perlu Docker, tidak perlu install apa pun di Mac.

Definisinya ada di [`.github/workflows/build-windows.yml`](../.github/workflows/build-windows.yml).

### Cara A — build percobaan (paling sering dipakai)

1. Pastikan kode sudah di-push: `git push origin master`
2. Buka repo di GitHub → tab **Actions**
3. Pilih workflow **Build Windows** di sidebar kiri
4. Klik **Run workflow** → **Run workflow**
5. Tunggu ~15 menit (build pertama; berikutnya lebih cepat karena cache)
6. Buka run yang selesai → bagian **Artifacts** → download
   `pos-sumur-yacob-windows`

Isinya file `.zip` berisi installer. Extract, lalu kirim ke client.

### Cara B — rilis resmi

```bash
git tag v0.1.0
git push origin v0.1.0
```

Workflow jalan otomatis dan membuat **draft release** di halaman Releases
lengkap dengan installer terlampir. Draft — jadi kamu bisa periksa dulu sebelum
klik Publish.

> Naikkan juga `version` di `pos-app/package.json` dan
> `pos-app/src-tauri/tauri.conf.json` supaya cocok dengan tagnya.

---

## 3. File mana yang dikirim ke client?

Build menghasilkan dua installer:

| File | Kapan dipakai |
| --- | --- |
| `pos-app_<versi>_x64-setup.exe` | **Ini yang dibagikan.** Installer NSIS, paling toleran terhadap Windows lawas. |
| `pos-app_<versi>_x64_en-US.msi` | Cadangan, untuk deploy via Group Policy di jaringan kantor. |

### Pemasangan tanpa internet

`tauri.conf.json` diset `webviewInstallMode: "offlineInstaller"`. Runtime
WebView2 lengkap ditempelkan ke dalam installer, jadi pemasangan **benar-benar
tidak butuh internet** — cocok untuk kios yang jaringannya tidak bisa
diandalkan. Konsekuensinya installer membengkak dari ~5 MB jadi **~130 MB**.

Mode sebelumnya (`embedBootstrapper`) menempelkan *bootstrapper*-nya saja
(~1.8 MB), dan bootstrapper itu tetap mengunduh runtime dari server Microsoft.
Manfaat nyatanya cuma menghindari kegagalan gara-gara Windows lawas tidak
mengaktifkan TLS 1.2 — bukan pemasangan offline. Jangan tertukar.

### Windows 7: TIDAK didukung

Sudah diuji langsung di mesin client (2026-08-17) dan hasilnya gagal:

```
The procedure entry point GetPackagesByPackageFamily could not be located
in the dynamic link library KERNEL32.dll
```

`GetPackagesByPackageFamily` adalah API Windows 8+. Windows 7 tidak punya
fungsi itu, jadi proses gagal dimuat sebelum satu baris kode pun jalan. Ini
terjadi di luar urusan WebView2 — mengganti `webviewInstallMode` tidak
menolong sama sekali.

Akar masalahnya: **Tauri v2 menetapkan Windows 10 (1803) sebagai minimum**.
Windows 7 dulu didukung di Tauri v1 dan di-drop di v2. Microsoft juga sudah
menghentikan dukungan WebView2 untuk Windows 7 (versi terakhir: 109).

Pilihan yang tersedia, dari yang paling masuk akal:

1. **Naikkan PC client ke Windows 10.** Paling murah dan paling waras. Windows
   7 juga sudah tidak menerima update keamanan sejak Januari 2020 — untuk mesin
   yang memegang data transaksi, ini risiko tersendiri.
2. **Turunkan project ke Tauri v1.** Bisa jalan di Win7, tapi rework besar:
   semua plugin (`sql`, `dialog`, `fs`, `opener`) harus turun ke versi v1,
   toolchain Rust harus dipin ke target `x86_64-win7-windows-msvc`, dan
   WebView2 109 tetap harus dipasang manual di mesin client.
3. **Ganti pendekatan**: jalankan POS sebagai web app lokal dan buka lewat
   browser yang masih mendukung Win7 (mis. Firefox ESR 115). Butuh perombakan
   arsitektur karena akses SQLite sekarang lewat plugin Tauri.

---

## 4. Kenapa tidak pakai Docker?

Pernah dicoba, lalu dibuang. Container Docker **selalu Linux**, jadi yang
dihasilkan adalah `.deb` Linux — bukan `.exe` yang dibutuhkan client. Untuk
sekadar ngoding pun kalah: window harus ditonton lewat VNC di browser dengan
render software, dan membangun image-nya makan puluhan menit karena Mac
Apple Silicon menarik paket dari `ports.ubuntu.com` yang tidak punya CDN.

Rust native di Mac (~2 menit pasang) + GitHub Actions untuk rilis Windows lebih
cepat di kedua sisi.
