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

INSERT INTO users (nama, username, password, role) VALUES
	('Sumur Yacob', 'sumuryacob', 'yacob', 'admin');

INSERT INTO barang (nama, harga, qty, barcode) VALUES
	('Beras 5kg', 65000, 20, '8991002100017'),
	('Minyak Goreng 1L', 18000, 30, '8991002100024'),
	('Gula Pasir 1kg', 16000, 25, '8991002100031'),
	('Telur Ayam 1kg', 28000, 15, NULL),
	('Kopi Sachet', 2000, NULL, '8991002100048'),
	('Mie Instan', 3500, 50, '8991002100055'),
	('Air Mineral 600ml', 4000, 40, '8991002100062'),
	('Sabun Mandi', 5000, 12, NULL);
