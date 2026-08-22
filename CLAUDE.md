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