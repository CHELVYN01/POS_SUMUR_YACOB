# POS Sumur Yacob

Sistem POS (Point of Sale) sederhana untuk kios/warung kecil. Desktop app, offline-first.

## Tech Stack

- **Shell**: Tauri v2 (Rust)
- **Frontend**: SvelteKit + TypeScript, di dalam `pos-app/`
- **Database lokal**: SQLite via `tauri-plugin-sql` (offline-first, sumber data utama)
- **Backup/sync**: Supabase (sinkronisasi berkala untuk backup data ke internet)

**Target mesin client: Windows dan Linux Mint** (dikembangkan di macOS). Fitur
yang menyentuh API OS — path folder data, keep-awake, dialog file — harus benar
di keduanya, bukan cuma tidak error di salah satunya.

## Struktur Project

```
pos-app/
  src/                     # frontend SvelteKit
    routes/
      kasir/                # halaman transaksi jual (scan barcode, checkout)
      produk/                # input barang, harga, stock
      laporan/               # laporan penjualan harian (export Excel)
      pengaturan/             # user, sinkronisasi Supabase, dll
    lib/
      db/                    # helper koneksi & query SQLite
      stores/                # Svelte stores (state global: cart, session user, dll)
      components/            # komponen UI reusable
      types/                 # tipe TypeScript bersama
  src-tauri/                # backend Rust, Tauri commands, plugin config
```

## Fitur (requirement client)

- Input barang: nama, harga, stock
- Jual barang via scan barcode
- Edit harga (untuk kenaikan harga / promo bonus)
- Laporan penjualan harian, export ke Excel
- Manajemen user (multi-kasir)
- Wajib bisa jalan offline penuh
- Backup data ke internet (via Supabase) saat online

## Lisensi (fase 21)

Aplikasi terkunci sampai kode lisensi dimasukkan. Kodenya diterbitkan website penjualan
(`../web-kios-pos`) dan **diverifikasi offline** oleh [lisensi.rs](pos-app/src-tauri/src/lisensi.rs)
memakai public key yang ditanam di binary — tidak ada panggilan server.

Kode **dikunci ke satu komputer**: payload memuat ID Mesin dan ikut ditandatangani, jadi
kode yang disalin ke komputer lain ditolak. Aktivasinya karena itu dua langkah — app
menampilkan ID Mesin, pembeli menukarnya di `/aktivasi` pada website bersama nomor
pesanan. Yang butuh internet cuma langkah menukar itu, dan boleh dari HP.

Spesifikasi format ada di [docs/lisensi.md](docs/lisensi.md) dan diimplementasikan
**dua kali** (Rust di sini, TypeScript di website). Ubah satu tanpa yang lain = kode
yang terbit tidak bisa dibaca aplikasi.

- Lisensi disimpan di `app_config_dir/lisensi.json`, **bukan** di `pos.db` — kalau ikut
  di database, Restore dari mesin lain membawa lisensi mesin itu dan "Buat Baru" akan
  menghapus lisensi yang sah.
- `/database-manager` sengaja tetap terbuka tanpa lisensi: mengunci aplikasi tidak boleh
  berarti menyandera data pemilik toko.
- Sebelum memasang versi berlisensi di mesin client yang sudah jalan, **terbitkan dulu
  kodenya** (`npm run lisensi -- --mesin <ID>` di repo website) — kalau tidak, mesin itu
  ikut terkunci dan pemiliknya tidak bisa jualan.

## Catatan Arsitektur

- **Odoo**: requirement awal client menyebut "sistem pos menggunakan odoo", tapi diputuskan **tidak dipakai untuk sekarang** — Odoo POS hanya jadi referensi UX/fitur, bukan dependency teknis. Bisa dipertimbangkan lagi nanti kalau ada kebutuhan integrasi spesifik.
- SQLite adalah source of truth saat offline. Sinkronisasi ke Supabase bersifat one-way backup (lokal → cloud) kecuali ditentukan lain nanti.

## Konvensi Kerja

- Setiap fitur/perubahan yang selesai dicatat di [list_done.md](docs\list_done.md) dengan format:
  `tanggal - nama fitur - git commit hash`
- Commit hanya dibuat saat diminta eksplisit oleh user.

## Rilis

Setiap kali user minta rilis/build, **selalu buat versi baru** — jangan pernah
menimpa atau memakai ulang versi yang sudah pernah dirilis. Versi lama tetap ada
di halaman Releases sebagai riwayat, dan yang dipasang di mesin client selalu
yang terbaru.

Langkahnya:

1. Naikkan nomor versi di **empat** tempat sekaligus, harus sama semua:
   - `pos-app/package.json`
   - `pos-app/package-lock.json` (pakai `npm version <versi> --no-git-tag-version`)
   - `pos-app/src-tauri/tauri.conf.json` ← ini yang menentukan versi installer
   - `pos-app/src-tauri/Cargo.toml`
2. Commit kenaikan versi itu.
3. Buat tag `v<versi>` lalu push tag-nya — workflow
   [build.yml](.github/workflows/build.yml) hanya jalan untuk membuat Release
   kalau ada tag `v*`.
4. Installer Windows (`.exe`/`.msi`) dan Linux (`.deb`/`.AppImage`) muncul di
   halaman Releases sebagai **draft** untuk diperiksa dulu, dan juga di bagian
   Artifacts pada run-nya.

Kenapa harus naik terus: kalau versinya tidak berubah, sulit memastikan mesin
client benar-benar memakai build terbaru — gejala lama bisa muncul lagi hanya
karena yang terpasang ternyata installer yang itu-itu juga. Nomor versi yang
tampil di dalam app (fix 9) dipakai untuk memverifikasi hal ini.