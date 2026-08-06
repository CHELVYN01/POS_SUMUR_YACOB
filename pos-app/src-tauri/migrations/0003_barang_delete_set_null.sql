PRAGMA foreign_keys = OFF;

CREATE TABLE item_penjualan_new (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	penjualan_id INTEGER NOT NULL REFERENCES penjualan(id) ON DELETE CASCADE,
	barang_id INTEGER REFERENCES barang(id) ON DELETE SET NULL,
	nama TEXT NOT NULL,
	harga INTEGER NOT NULL,
	jumlah INTEGER NOT NULL
);

INSERT INTO item_penjualan_new (id, penjualan_id, barang_id, nama, harga, jumlah)
SELECT id, penjualan_id, barang_id, nama, harga, jumlah FROM item_penjualan;

DROP TABLE item_penjualan;
ALTER TABLE item_penjualan_new RENAME TO item_penjualan;

CREATE INDEX idx_item_penjualan_penjualan_id ON item_penjualan(penjualan_id);

CREATE TABLE item_kasbon_new (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	kasbon_id INTEGER NOT NULL REFERENCES kasbon(id) ON DELETE CASCADE,
	barang_id INTEGER REFERENCES barang(id) ON DELETE SET NULL,
	nama TEXT NOT NULL,
	harga INTEGER NOT NULL,
	jumlah INTEGER NOT NULL
);

INSERT INTO item_kasbon_new (id, kasbon_id, barang_id, nama, harga, jumlah)
SELECT id, kasbon_id, barang_id, nama, harga, jumlah FROM item_kasbon;

DROP TABLE item_kasbon;
ALTER TABLE item_kasbon_new RENAME TO item_kasbon;

CREATE INDEX idx_item_kasbon_kasbon_id ON item_kasbon(kasbon_id);

PRAGMA foreign_keys = ON;
