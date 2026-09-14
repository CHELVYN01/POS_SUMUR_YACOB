-- Hak akses Laporan untuk user non-admin (role 'kasir').
--
-- '0' = kasir melihat seluruh laporan, persis seperti sebelum pengaturan ini ada.
-- '1' = kasir hanya boleh melihat laporan HARI INI; tab Dashboard & Keseluruhan
--       disembunyikan dan Export Excel dikunci ke hari ini.
--
-- Default sengaja '0' — sama seperti perilaku lama. Upgrade aplikasi tidak boleh
-- diam-diam menutup halaman yang kemarin masih terbuka; admin yang memutuskan,
-- lewat Pengaturan > Laporan.
INSERT INTO pengaturan (kunci, nilai) VALUES ('laporan_kasir_hari_ini', '0');
