# Menjalankan & Membangun POS Sumur Yacob

Dua hal yang berbeda, jangan tertukar:

| Tujuan | Di mana | Hasil |
| --- | --- | --- |
| **Ngoding sehari-hari** | MacBook (lokal) | window app macOS, hot reload |
| **Installer untuk client** | GitHub Actions | `.exe` Windows + `.deb` Linux |

Mesin client ada dua macam: **Windows** dan **Linux Mint**. macOS hanya dipakai
untuk ngoding — installer keduanya tidak bisa dan tidak perlu dibuat dari Mac,
karena tiap OS butuh dibangun di OS-nya sendiri.

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

## 2. Membuat installer (rilis)

Dijalankan oleh GitHub Actions di runner Windows dan Linux asli. Tidak perlu PC
Windows, tidak perlu PC Linux, tidak perlu Docker, tidak perlu install apa pun
di Mac.

Definisinya ada di [`.github/workflows/build.yml`](../.github/workflows/build.yml).
Satu workflow, dua job build (`windows` dan `linux`) yang jalan berbarengan,
lalu satu job `release` yang mengumpulkan hasil keduanya.

### Cara A — build percobaan (paling sering dipakai)

1. Pastikan kode sudah di-push: `git push origin master`
2. Buka repo di GitHub → tab **Actions**
3. Pilih workflow **Build Installer** di sidebar kiri
4. Klik **Run workflow**. Ada pilihan **Platform**: `semua` (default),
   `windows`, atau `linux` — pakai kalau cuma mau menguji satu sisi.
5. Tunggu ~15 menit (build pertama; berikutnya lebih cepat karena cache)
6. Buka run yang selesai → bagian **Artifacts** → download
   `pos-sumur-yacob-windows` dan/atau `pos-sumur-yacob-linux`

Isinya file `.zip` berisi installer. Extract, lalu kirim ke client.

### Cara B — rilis resmi

```bash
git tag v0.1.8
git push origin v0.1.8
```

Workflow jalan otomatis dan membuat **draft release** di halaman Releases
lengkap dengan installer Windows *dan* Linux terlampir. Draft — jadi kamu bisa
periksa dulu sebelum klik Publish.

> Naikkan dulu `version` di keempat tempat (`package.json`,
> `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`)
> supaya cocok dengan tagnya. Lihat bagian Rilis di `CLAUDE.md`.

---

## 3. File mana yang dikirim ke client?

### Windows

| File | Kapan dipakai |
| --- | --- |
| `pos-app_<versi>_x64-setup.exe` | **Ini yang dibagikan.** Installer NSIS, paling toleran terhadap Windows lawas. |
| `pos-app_<versi>_x64_en-US.msi` | Cadangan, untuk deploy via Group Policy di jaringan kantor. |

### Linux Mint

| File | Kapan dipakai |
| --- | --- |
| `pos-app_<versi>_amd64.deb` | **Ini yang dibagikan.** Paket normal Mint/Ubuntu, masuk menu aplikasi, bisa di-update dengan memasang versi baru di atasnya. |
| `pos-app_<versi>_amd64.AppImage` | Cadangan portabel: satu file, tidak dipasang, tinggal `chmod +x` lalu dijalankan. Berguna kalau `.deb` ditolak karena beda versi distro. |

Memasang `.deb`-nya:

```bash
sudo apt install ./pos-app_0.1.8_amd64.deb
```

Pakai `apt install ./file.deb`, **bukan** `dpkg -i` — `apt` sekalian menarik
dependency sistem (WebKitGTK dan kawan-kawannya) yang mungkin belum terpasang;
`dpkg` akan berhenti dengan error dependency dan meninggalkan paket setengah
terpasang.

Di Linux, Tauri memakai **WebKitGTK milik sistem**, tidak ada runtime yang ikut
ditempelkan seperti WebView2 di Windows. Karena itu `.deb`-nya kecil (~10 MB,
bukan ~130 MB), tapi pemasangan pertama di mesin yang belum punya WebKitGTK
butuh internet sekali untuk menarik dependency-nya. Setelah terpasang, app
jalan offline penuh seperti biasa.

### Kenapa runner-nya dipin ke Ubuntu 22.04

Paket `.deb` terikat pada versi glibc mesin yang membangunnya. Kalau dibangun
di Ubuntu 24.04 (`ubuntu-latest`), hasilnya hanya jalan di Mint 22 ke atas dan
gagal di Mint 21 dengan `GLIBC_2.38 not found`. Dibangun di 22.04, jalan di
Mint 21 maupun Mint 22. Jadi `runs-on: ubuntu-22.04` di workflow itu disengaja
— jangan dinaikkan hanya karena ada runner yang lebih baru.

### Pemasangan tanpa internet (Windows)

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

Pernah dicoba, lalu dibuang. Container Docker **selalu Linux**, jadi `.exe`
Windows tetap tidak bisa dihasilkan dari situ. Untuk `.deb` pun kalah dari
runner GitHub yang sudah Linux asli dan gratis. Untuk sekadar ngoding lebih
kalah lagi: window harus ditonton lewat VNC di browser dengan render software,
dan membangun image-nya makan puluhan menit karena Mac Apple Silicon menarik
paket dari `ports.ubuntu.com` yang tidak punya CDN. Ditambah lagi Docker di Mac
Apple Silicon itu arm64, sedangkan mesin client x86_64 — `.deb`-nya pun salah
arsitektur.

Rust native di Mac (~2 menit pasang) + GitHub Actions untuk rilis Windows &
Linux lebih cepat di semua sisi.
