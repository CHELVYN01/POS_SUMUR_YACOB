# POS Sumur Yacob

Sistem POS (Point of Sale) sederhana untuk kios/warung kecil. Desktop app, offline-first.

## Tech Stack

- **Shell**: Tauri v2 (Rust)
- **Frontend**: SvelteKit + TypeScript, di dalam `pos-app/`
- **Database lokal**: SQLite via `tauri-plugin-sql` (offline-first, sumber data utama)
- **Backup/sync**: Supabase (sinkronisasi berkala untuk backup data ke internet)

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