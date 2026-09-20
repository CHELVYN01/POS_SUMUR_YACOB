-- Kategori produk, supaya pemasukan bisa dipisah per kelompok barang.
--
-- Kebutuhannya dari client: ada beberapa produk yang uang pembelian & penjualannya
-- dipisah dari barang dagangan biasa. Tanpa kategori, angka itu tercampur di satu
-- total dan tidak bisa dipertanggungjawabkan ke pemilik uangnya masing-masing.
CREATE TABLE kategori (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	nama TEXT NOT NULL UNIQUE,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- NULL = belum dikategorikan. Sengaja tidak ada kategori "Umum" bawaan yang
-- dipasang ke semua produk lama: itu mengaku-aku bahwa produknya sudah
-- dikelompokkan, padahal belum ada yang memeriksanya. Laporan menyebutnya
-- "Tanpa Kategori" supaya kelihatan masih ada yang perlu dirapikan.
--
-- ON DELETE SET NULL: menghapus kategori tidak boleh ikut menghapus produknya.
-- Produknya cuma kembali tak berkategori.
ALTER TABLE barang ADD COLUMN kategori_id INTEGER REFERENCES kategori(id) ON DELETE SET NULL;

-- Kategori DISALIN ke baris transaksi saat penjualan terjadi, bukan di-JOIN ke
-- barang waktu laporan dibuka. Alasannya sama persis dengan harga_beli di
-- migration 0005: kalau di-JOIN, memindahkan sebuah produk ke kategori lain hari
-- ini akan mengubah laporan bulan lalu, dan angka yang sudah dilaporkan ke pemilik
-- uang tidak boleh bergerak sendiri.
--
-- NULL berarti produknya memang belum berkategori saat terjual — bukan "hilang".
ALTER TABLE item_penjualan ADD COLUMN kategori TEXT;

-- Kas bon ikut mencatat walau laporan per kategori belum menampilkan bon.
-- Datanya tidak bisa dihitung mundur kalau baru dicatat nanti.
ALTER TABLE item_kasbon ADD COLUMN kategori TEXT;

CREATE INDEX idx_barang_kategori_id ON barang(kategori_id);
