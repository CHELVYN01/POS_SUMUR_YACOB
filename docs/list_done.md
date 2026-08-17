# List Done

Format: `tanggal pengerjaan - nama feat - git commit`

- 2026-08-06 - setup awal project (Tauri + SvelteKit + tauri-plugin-sql, struktur folder, CLAUDE.md) - 410f2c8
- 2026-08-06 - fase 2: UI dasar POS dengan dummy data (login, sidebar, navbar, dark mode, kasir, input barang + barcode, list penjualan, pengaturan) - 538e38f
- 2026-08-06 - fase 3: database SQLite + CRUD nyata (barang, user, penjualan), kelola user via modal khusus admin - 7773544
- 2026-08-06 - fase 4: log aktivitas di Kasir & Input Barang, validasi wajib barcode/harga - 83fc05a
- 2026-08-06 - fase 5: branding (icon, splash, logo), fullscreen, perbaikan UX login & dark mode - 480b78e
- 2026-08-06 - fase 6: judul sidebar profesional dengan icon, indikator status scan di navbar dark mode, popup invoice sebelum bayar - 8216e49
- 2026-08-06 - fix 1: splash window transparan terpisah + loading persentase, redesain login 2 kolom - f3b4116
- 2026-08-06 - fase 7: nama & alamat toko dinamis (pengaturan), sidebar diperlebar dengan header logo bergradient - e7c708b
- 2026-08-06 - fase 8: fitur Kas Bon (utang barang multi-item, cicilan bertahap, popup tambah bon, custom date picker), guard sesi login - 9d60e92
- 2026-08-06 - fase 9: auto-refocus input scan/barcode di Kasir & Input Barang setelah interaksi lain, biar scanner USB tetap nyambung - ddd413b
- 2026-08-06 - fase 10: gabung menu List Penjualan jadi Laporan dengan tab Penjualan & Kas Bon (rekap read-only) - 7126ea3
- 2026-08-06 - fase 11: export laporan ke Excel 3 sheet (Dashboard, Penjualan, Bon) dengan styling ExcelJS (header hijau, format rupiah, border, zebra) - befbc85
- 2026-08-07 - fix 2: input uang dibayar & kembalian otomatis di popup invoice kasir, tombol shortcut Uang Pas, validasi cegah bayar jika uang kurang - 28b7d7d
- 2026-08-07 - fix 3: hapus barang error FOREIGN KEY constraint (migration ON DELETE SET NULL untuk item_penjualan & item_kasbon), tambah konfirmasi & pesan error saat hapus barang - a421dfb
- 2026-08-08 - fase 13: Database Manager ala Odoo di layar login (Backup/Restore/Buat Baru via zip, master password terpisah, file-swap aman sebelum restart), Pengaturan diubah jadi tab (Umum/User/Sinkronisasi/Keamanan) - d3bbdd9
- 2026-08-08 - fase 14: warning popup stok habis saat bayar di kasir, stok otomatis berkurang setelah pembayaran, rename label Jual Barang/Input Barang jadi Penjualan/Produk - 2b66e19
- 2026-08-08 - fase 15: auto-backup mingguan (cek tiap app dibuka, retensi 4 file terbaru), lokasi folder bisa dipilih admin di Pengaturan > Sinkronisasi dengan fallback ke Documents/POS-Backup - eb013e2
- 2026-08-08 - fase 16: multi-keranjang di Penjualan (tab keranjang, max 5, tutup otomatis setelah bayar), state dipindah ke module store supaya tidak hilang saat pindah halaman - 7a712a6
- 2026-08-09 - fix 5: installer Windows embed WebView2 bootstrapper (webviewInstallMode: embedBootstrapper) supaya tidak gagal saat tidak ada internet/TLS lawas, untuk kompatibilitas Windows 7 - 7cd3879
- 2026-08-17 - build Windows via GitHub Actions (workflow build-windows.yml: artifact manual + draft release saat tag v*), hapus setup Docker/Linux yang tidak dipakai, docs/build.md gantikan docs/docker.md - 1202c55
- 2026-08-17 - fase 17: scan dikunci ke satu kolom per halaman (action manualSaja mendeteksi ketikan burst scanner dan mengalihkannya, tidak ada lagi barcode nyasar ke Cari produk/Nama Produk), alur bayar jadi satu langkah (uang dibayar & kembalian di footer keranjang, Enter untuk bayar, popup hanya menampilkan struk hasil), perbaikan a11y popup invoice - b55314c
- 2026-08-17 - fix 6: installer Windows pakai webviewInstallMode offlineInstaller (runtime WebView2 lengkap ikut di installer, ~130 MB, pemasangan tanpa internet), docs/build.md mencatat Windows 7 tidak didukung (GetPackagesByPackageFamily hanya ada di Win8+, Tauri v2 minimum Win10 1803) - 07d0eb6
