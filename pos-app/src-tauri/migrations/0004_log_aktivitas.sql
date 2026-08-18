-- Log aktivitas Penjualan & Produk dipindah dari memori halaman ke SQLite,
-- supaya tidak hilang begitu kasir pindah menu. Retensi 24 jam, dibersihkan
-- dari frontend (hapusLogKedaluwarsa) tiap app dibuka.
--
-- `waktu` diisi datetime('now') = UTC, sama seperti kolom tanggal lain di DB.
-- Pembacaannya WAJIB lewat parseWaktuDb(), jangan diparse langsung.
--
-- user_nama disimpan apa adanya (bukan cuma user_id) supaya baris log tetap
-- terbaca walau user-nya dihapus — log ini gunanya menelusuri kesalahan input,
-- jadi jejak siapa yang melakukan lebih penting daripada relasinya.
CREATE TABLE log_aktivitas (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	halaman TEXT NOT NULL CHECK (halaman IN ('kasir', 'produk')),
	pesan TEXT NOT NULL,
	user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
	user_nama TEXT,
	waktu TEXT NOT NULL DEFAULT (datetime('now'))
);

-- dipakai pembersihan retensi 24 jam (WHERE waktu < ...)
CREATE INDEX idx_log_aktivitas_waktu ON log_aktivitas(waktu);

-- dipakai saat halaman memuat lognya sendiri (WHERE halaman = ? ORDER BY waktu DESC)
CREATE INDEX idx_log_aktivitas_halaman_waktu ON log_aktivitas(halaman, waktu DESC);
