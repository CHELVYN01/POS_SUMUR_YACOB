CREATE TABLE kasbon (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	nama_pengutang TEXT NOT NULL,
	kasir_id INTEGER NOT NULL REFERENCES users(id),
	tanggal TEXT NOT NULL DEFAULT (datetime('now')),
	jatuh_tempo TEXT,
	total INTEGER NOT NULL,
	status TEXT NOT NULL DEFAULT 'belum_lunas' CHECK (status IN ('belum_lunas', 'lunas'))
);

CREATE TABLE item_kasbon (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	kasbon_id INTEGER NOT NULL REFERENCES kasbon(id) ON DELETE CASCADE,
	barang_id INTEGER REFERENCES barang(id),
	nama TEXT NOT NULL,
	harga INTEGER NOT NULL,
	jumlah INTEGER NOT NULL
);

CREATE TABLE pembayaran_kasbon (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	kasbon_id INTEGER NOT NULL REFERENCES kasbon(id) ON DELETE CASCADE,
	tanggal TEXT NOT NULL DEFAULT (datetime('now')),
	jumlah INTEGER NOT NULL
);

CREATE INDEX idx_item_kasbon_kasbon_id ON item_kasbon(kasbon_id);
CREATE INDEX idx_pembayaran_kasbon_kasbon_id ON pembayaran_kasbon(kasbon_id);
