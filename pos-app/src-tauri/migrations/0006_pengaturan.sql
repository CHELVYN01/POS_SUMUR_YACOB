-- Pengaturan aplikasi, bentuk kunci-nilai.
--
-- Ditaruh di database, bukan localStorage seperti nama & alamat toko: ini aturan
-- yang menentukan boleh-tidaknya sebuah transaksi terjadi. Aturan seperti itu harus
-- ikut terbawa saat Backup/Restore dan sama untuk semua kasir, bukan menempel di
-- browser masing-masing mesin.
CREATE TABLE pengaturan (
	kunci TEXT PRIMARY KEY,
	nilai TEXT NOT NULL,
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- '1' = longgar: stok 0 tetap boleh dijual (perilaku sejak awal aplikasi ini ada).
-- '0' = ketat: stok 0 tidak bisa dijual dan stok wajib diisi saat menambah produk.
--
-- Default sengaja longgar. Toko yang sudah berjalan punya ratusan produk tanpa stok;
-- kalau default-nya ketat, upgrade aplikasi akan langsung menghentikan penjualan.
INSERT INTO pengaturan (kunci, nilai) VALUES ('stok_longgar', '1');
