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

### Soal Windows 7

`tauri.conf.json` sudah diset `webviewInstallMode: "embedBootstrapper"`. Ini
menempelkan installer WebView2 ke dalam installer POS (+~1.8 MB), sehingga
pemasangan **tidak butuh internet** dan tidak gagal gara-gara Windows 7 lawas
tidak mengaktifkan TLS 1.2.

Catatan jujur: Microsoft sudah menghentikan dukungan WebView2 untuk Windows 7.
App tetap bisa dipasang dan jalan, tapi memakai WebView2 versi lama yang tidak
lagi menerima update keamanan. Kalau client masih di Windows 7, ini bisa
diterima untuk POS offline — tapi Windows 10 ke atas tetap jauh lebih aman.

---

## 4. Kenapa tidak pakai Docker?

Pernah dicoba, lalu dibuang. Container Docker **selalu Linux**, jadi yang
dihasilkan adalah `.deb` Linux — bukan `.exe` yang dibutuhkan client. Untuk
sekadar ngoding pun kalah: window harus ditonton lewat VNC di browser dengan
render software, dan membangun image-nya makan puluhan menit karena Mac
Apple Silicon menarik paket dari `ports.ubuntu.com` yang tidak punya CDN.

Rust native di Mac (~2 menit pasang) + GitHub Actions untuk rilis Windows lebih
cepat di kedua sisi.
