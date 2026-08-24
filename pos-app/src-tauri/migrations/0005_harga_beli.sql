-- Harga beli, untuk menghitung laba.
--
-- Semuanya NULL-able dan itu disengaja: NULL berarti "belum diisi", berbeda dari 0
-- yang berarti "barangnya memang gratis". Kalau keduanya disamakan, produk lama yang
-- belum sempat diisi akan terbaca untung 100% dan seluruh laporan labanya bohong.
ALTER TABLE barang ADD COLUMN harga_beli INTEGER;

-- Disalin ke baris transaksi saat penjualan terjadi, bukan dibaca lewat JOIN ke
-- barang. Harga beli berubah tiap kulakan; kalau labanya dihitung dari harga beli
-- hari ini, laba bulan lalu ikut berubah sendiri tiap kali harga kulakan naik.
-- Pola yang sama sudah dipakai kolom nama & harga di tabel ini.
ALTER TABLE item_penjualan ADD COLUMN harga_beli INTEGER;

-- Kas bon ikut mencatat, walau laporan labanya belum menampilkan bon. Datanya tidak
-- bisa dihitung mundur kalau baru dicatat nanti.
ALTER TABLE item_kasbon ADD COLUMN harga_beli INTEGER;
