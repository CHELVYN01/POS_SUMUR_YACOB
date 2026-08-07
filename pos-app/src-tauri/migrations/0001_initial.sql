CREATE TABLE users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	nama TEXT NOT NULL,
	username TEXT NOT NULL UNIQUE,
	password TEXT NOT NULL,
	role TEXT NOT NULL CHECK (role IN ('admin', 'kasir')),
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE barang (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	nama TEXT NOT NULL,
	harga INTEGER NOT NULL,
	qty INTEGER,
	barcode TEXT UNIQUE,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE penjualan (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	tanggal TEXT NOT NULL DEFAULT (datetime('now')),
	kasir_id INTEGER NOT NULL REFERENCES users(id),
	total INTEGER NOT NULL
);

CREATE TABLE item_penjualan (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	penjualan_id INTEGER NOT NULL REFERENCES penjualan(id) ON DELETE CASCADE,
	barang_id INTEGER REFERENCES barang(id),
	nama TEXT NOT NULL,
	harga INTEGER NOT NULL,
	jumlah INTEGER NOT NULL
);

CREATE INDEX idx_item_penjualan_penjualan_id ON item_penjualan(penjualan_id);
