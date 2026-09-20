# Plan V2 — Kandidat Fitur Menuju POS Profesional

Status: **ide / belum dikerjakan.** Dokumen ini bukan antrean kerja, tapi kumpulan
kandidat fitur beserta alasan kenapa ia layak dikerjakan. Yang sudah disetujui untuk
dikerjakan dipindahkan ke [plan.md](plan.md) sebagai fase bernomor, dan yang sudah
selesai dicatat di [list_done.md](list_done.md) seperti biasa.

Semua ide di bawah sudah disaring supaya **tidak mengulang** yang sudah ada:

- sudah jadi (fase 1–21 & fix 1–8): lisensi offline, Database Manager, auto-backup
  lokal, multi-keranjang, kas bon, scanner, dashboard laporan, import/export produk
  Excel, keep-awake, build Windows + Linux Mint
- sudah ada di [plan_masih_dikepala.md](plan_masih_dikepala.md): setting stok keras/
  lunak, versi Android/tablet

Prinsip yang dipegang di semua ide ini: **offline dulu**. Fitur yang mensyaratkan
internet ditandai jelas dan ditaruh di Tier 3.

---

## Ringkasan prioritas

| # | Fitur | Tier | Butuh internet | Ketergantungan |
|---|---|---|---|---|
| 1 | Cetak struk thermal + laci kas | 1 | tidak | — |
| 2 | Tutup Kasir / Shift | 1 | tidak | ideal setelah #1 (cetak laporan shift) |
| 3 | Retur & Void transaksi | 1 | tidak | — |
| 4 | Harga modal, stok masuk, laporan laba | 1 | tidak | — |
| 5 | Metode pembayaran (tunai/QRIS/transfer/split) | 2 | tidak | menguatkan #2 |
| 6 | Diskon, promo, harga grosir | 2 | tidak | — |
| 7 | Master pelanggan + piutang | 2 | tidak | perluasan kas bon (fase 8) |
| 8 | Cetak label barcode | 2 | tidak | #1 (printer) |
| 9 | Auto-updater | 2 | ya (saat update) | fase 20 (GitHub Releases) |
| 10 | Sinkronisasi Supabase | 3 | ya | — |
| 11 | Multi-outlet + dashboard owner | 3 | ya | #10 |
| 12 | Tier lisensi mengunci fitur | 3 | tidak | fase 21 |
| 13 | Peran & hak akses (role) | 3 | tidak | — |

**Rekomendasi tiga berikutnya: #1 → #2 → #4.** Ketiganya menjawab pertanyaan pertama
calon pembeli ("bisa cetak struk?", "bisa tahu kasir nilep?", "bisa tahu untung?"),
berdiri sendiri tanpa Supabase, dan tidak mengubah arsitektur yang ada.

---

# Tier 1 — pembeda utama "POS beneran" vs aplikasi kasir hobi

## 1. Cetak struk thermal (58/80mm) + buka laci kas

**Masalah:** sekarang transaksi selesai tanpa jejak fisik apa pun untuk pembeli. Bagi
pemilik kios, ada-tidaknya struk adalah ukuran pertama apakah sebuah POS layak dibeli.

**Lingkup:**
- template struk: logo, nama toko, alamat (datanya sudah ada dari fase 7), daftar item,
  total, uang diterima & kembalian (sudah ada dari fix 2), nama kasir, nomor transaksi
- cetak **ESC/POS langsung ke printer**, bukan lewat dialog print WebView — dialog print
  browser menghasilkan margin kertas A4 di printer 58mm dan tidak bisa dipakai
- **cetak ulang struk** dari halaman Laporan. Ini bukan fitur tambahan, ini yang paling
  sering dipakai: kertas habis atau macet di tengah cetak
- perintah buka laci kas (drawer kick, `ESC p 0 25 250`) dikirim lewat printer yang sama
- pengaturan printer di Pengaturan > tab baru: pilih port/device, lebar kertas 58 atau
  80mm, tes cetak
- opsional fase berikutnya: struk sebagai PDF/gambar untuk dikirim lewat WhatsApp, buat
  toko yang belum punya printer

**Catatan teknis:**
- implementasi di Rust sebagai command baru (`src-tauri/src/printer.rs`), bukan di
  frontend — frontend hanya mengirim data struk terstruktur
- **lintas OS, hati-hati seperti kasus keep-awake fase 19 dan `db_dir()` fase 20.**
  Windows umumnya lewat nama share printer atau port USB; Linux lewat `/dev/usb/lp0`
  atau CUPS raw queue. Jangan anggap satu jalur jalan di keduanya tanpa dites
- printer thermal sangat beragam. Rencanakan **fallback**: kalau perintah spesifik
  gagal, tetap bisa cetak teks polos
- laci kas tidak punya jalur sendiri — ia dibuka oleh printer. Kalau printernya tidak
  ada, fitur laci kas otomatis tidak tersedia, dan itu harus dijelaskan di UI

---

## 2. Tutup Kasir / Shift (modal awal → setoran → selisih)

**Masalah:** multi-user sudah ada sejak fase 3, tapi belum ada pertanggungjawaban uang.
Tidak ada cara menjawab "kenapa uang di laci kurang Rp200rb, siapa yang jaga waktu itu?".
Untuk toko yang mempekerjakan orang lain, ini fitur yang paling dicari.

**Alur:**
1. **Buka shift** — kasir login, input modal awal laci (uang kecil untuk kembalian)
2. **Selama shift** — setiap penjualan & bon terikat `shift_id`
3. **Tutup shift** — sistem hitung *seharusnya* ada berapa:
   `modal awal + penjualan tunai − kembalian − pengeluaran kas`
   Kasir menghitung uang fisik dan menginputnya, sistem menampilkan **selisih**
   (lebih / kurang / pas)
4. Cetak laporan tutup shift (butuh #1)

**Tambahan yang menyatu:**
- **kas masuk / kas keluar** di luar penjualan (ambil uang untuk beli galon, setor ke
  pemilik). Tanpa ini, selisih akan selalu salah dan fiturnya jadi tidak dipercaya
- riwayat shift di Laporan, per kasir, dengan selisihnya

**Catatan teknis:**
- tabel baru `shift` (id, user_id, modal_awal, dibuka_pada, ditutup_pada, uang_fisik,
  selisih, catatan) dan `kas_mutasi` (id, shift_id, jenis, nominal, keterangan)
- `penjualan` dan `kas_bon` dapat kolom `shift_id`
- **konsisten UTC seperti fase 17 & fix 7** — jangan ulangi bug tanggal
- shift yang lupa ditutup (app mati / listrik padam): saat app dibuka dan ditemukan
  shift terbuka milik hari sebelumnya, tawarkan tutup paksa dengan catatan, jangan
  biarkan menggantung selamanya
- shift bersinggungan dengan multi-keranjang (fase 16): keranjang yang belum dibayar
  saat tutup shift harus dicegah atau diperingatkan

---

## 3. Retur & Void transaksi (dengan alasan + jejak audit)

**Masalah:** transaksi salah sekarang tidak bisa dibatalkan sama sekali. Satu salah scan
berarti laporan dan stok ikut salah selamanya.

**Lingkup:**
- **Void** transaksi hari ini: stok kembali, transaksi ditandai batal (bukan dihapus),
  wajib isi alasan, tercatat siapa yang membatalkan
- **Retur sebagian**: pembeli kembalikan 1 dari 3 item, uang dikembalikan sebagian
- semua masuk `log_aktivitas` yang sudah ada dari fix 7

**Catatan teknis:**
- **jangan pernah hard delete.** Tambah kolom status pada `penjualan`
  (`aktif` / `batal` / `retur_sebagian`) plus tabel `retur` untuk detail per item.
  Data yang dihapus tidak bisa diaudit, dan justru transaksi yang dibatalkan itulah
  yang paling perlu diaudit
- semua agregat laporan (fase 17, sudah dipindah ke SQL) harus menyaring status batal —
  cek satu per satu, jangan sampai ada query yang terlewat dan angkanya beda antar tab
- kalau #2 sudah ada: void hanya boleh untuk transaksi dalam shift yang masih terbuka.
  Transaksi shift yang sudah ditutup harus lewat retur, supaya angka setoran yang sudah
  dilaporkan tidak berubah di belakang

---

## 4. Harga modal, stok masuk, dan laporan LABA

**Masalah:** laporan sekarang hanya bisa menjawab "omzet berapa", belum "untung berapa".
Padahal itu pertanyaan pertama pemilik toko. Ini fitur yang paling sering membuat orang
bersedia bayar lebih mahal.

**Lingkup:**
- kolom `harga_modal` di produk (ikut masuk ke template export/import Excel fase 18 —
  ingat aturan fase 18: kolom dicocokkan lewat judul, bukan urutan, jadi menambah kolom
  tidak merusak file lama)
- halaman **Stok Masuk**: barang datang → stok bertambah, harga modal ter-update,
  tercatat tanggal & supplier
- data **supplier** sederhana (nama, kontak, catatan)
- **laporan laba kotor** = penjualan − HPP, per hari / bulan, menyatu ke dashboard fase 17
- **stok opname**: hitung fisik vs sistem → selisih → penyesuaian tercatat

**Catatan teknis:**
- tentukan metode HPP di awal dan tulis keputusannya: **harga modal terakhir** paling
  sederhana dan paling mudah dijelaskan ke pemilik warung; rata-rata bergerak lebih
  akurat tapi lebih sulit dipertanggungjawabkan saat angkanya dipertanyakan.
  Rekomendasi: harga modal terakhir, tapi **simpan `harga_modal` snapshot di
  `item_penjualan`** saat transaksi terjadi. Tanpa snapshot, mengubah harga modal hari
  ini akan mengubah laba bulan lalu
- stok masuk membuat stok punya dua sumber perubahan (jual & beli) — pertimbangkan tabel
  `stok_mutasi` sebagai satu-satunya jalur perubahan stok, supaya selisih stok selalu
  bisa ditelusuri
- hormati sifat stok opsional (fase 14): produk yang stoknya tidak dilacak tidak ikut
  opname, dan `NULL` tetap berbeda artinya dari `0`

---

# Tier 2 — melengkapi & merapikan yang sudah ada

## 5. Metode pembayaran (Tunai / QRIS / Transfer / Split)

Sekarang semua transaksi diasumsikan tunai (fix 2: input uang diterima → kembalian).
Padahal QRIS sudah umum bahkan di warung kecil.

- pilihan metode saat bayar; kolom "uang diterima" hanya relevan untuk tunai
- **split payment**: Rp50rb tunai + sisanya QRIS
- laporan memisahkan **uang di laci** vs **masuk rekening** — ini yang membuat angka
  selisih di #2 benar. Tanpa pemisahan ini, transaksi QRIS akan dihitung sebagai uang
  tunai yang seharusnya ada di laci
- tidak ada integrasi payment gateway. Kasir menandai secara manual bahwa QRIS sudah
  masuk — tetap 100% offline

## 6. Diskon, promo, dan harga grosir

Requirement awal menyebut "bonus", tapi implementasinya masih sebatas edit harga manual.

- diskon per item dan per transaksi (nominal maupun persen)
- **harga grosir**: beli ≥ 12 pcs harga berbeda — sangat umum di kios sembako, dan
  sekarang hanya bisa diakali dengan mengubah harga produk lalu mengembalikannya
- paket/bundling sederhana
- diskon ikut tercatat per transaksi supaya laporan laba (#4) tidak salah hitung

## 7. Master pelanggan + laporan piutang

Kas bon (fase 8) sekarang menerima nama bebas berupa teks. Akibatnya "Budi", "budi", dan
"Pak Budi" adalah tiga orang berbeda, dan pertanyaan "total utang Budi berapa?" tidak
bisa dijawab. Ini upgrade paling murah dari fitur yang sudah ada.

- master pelanggan (nama, kontak, catatan)
- kas bon menunjuk ke pelanggan, bukan teks bebas — dengan migrasi data bon lama yang
  mencocokkan nama, sisanya dibiarkan sebagai teks
- riwayat & total utang per orang
- bon lewat jatuh tempo disorot; ringkasan piutang keseluruhan di dashboard
- opsional: batas utang per pelanggan, dengan peringatan saat dilampaui

## 8. Cetak label barcode

Untuk barang curah / repack yang tidak punya barcode pabrik — generate barcode internal,
cetak label. Pelengkap alami dari scanner yang sudah jalan (fase 9) dan printer (#1).
Cetak massal dari daftar produk terpilih, bukan satu per satu.

## 9. Auto-updater

**Ini fitur untuk Bapak sendiri, bukan untuk client.** Begitu lisensi (fase 21) dijual ke
banyak mesin, setiap perbaikan berarti mengirim installer satu per satu dan memandu
pemasangan lewat telepon.

- `tauri-plugin-updater` + signature, sumbernya GitHub Releases yang sudah ada dari fase 20
- app memeriksa versi baru saat dibuka, menawarkan update, tidak memaksa
- **jangan pernah update di tengah jam operasional tanpa persetujuan** — kasir yang
  aplikasinya restart sendiri saat antre pembeli akan berhenti memakai produknya
- perhatikan interaksi dengan `apply_pending_db_swap_if_any()` fase 13 dan migrasi
  SQLite: update yang membawa migrasi baru harus tetap aman terhadap database lama
- versi yang tampil di dalam app (fix 9) menjadi cara memverifikasi update benar terpasang

---

# Tier 3 — kalau target naik ke multi-outlet / perusahaan

## 10. Sinkronisasi Supabase (butuh internet)

Supabase sudah disebut di tech stack sejak awal tapi belum ada kodenya sama sekali.
Auto-backup fase 15 masih murni lokal (`Documents/POS-Backup/`).

- one-way dulu (lokal → cloud), sesuai catatan arsitektur di CLAUDE.md
- membuka: lihat penjualan dari HP, data aman saat laptop rusak/hilang, prasyarat #11
- **SQLite tetap source of truth.** Sync tidak boleh pernah memblokir kasir berjualan;
  gagal sync adalah urusan latar belakang, bukan error yang menghentikan transaksi
- butuh antrean perubahan lokal (outbox) supaya transaksi saat internet mati tetap
  terkirim belakangan — bukan sekadar mengunggah file db

## 11. Multi-outlet + dashboard owner (butuh #10)

Satu pemilik, beberapa kios. Laporan gabungan, perbandingan antar cabang, transfer stok
antar cabang. Di titik ini nomor ID lokal tidak lagi cukup dan perlu identitas global —
pertimbangkan ini sejak #10 dirancang, bukan setelahnya.

## 12. Tier lisensi yang benar-benar mengunci fitur

Di fase 21 tier sudah ikut ditandatangani dan tampil di Pengaturan, tapi **belum ada satu
pun fitur yang dikunci**. Mekanismenya sudah ada, tinggal dipakai — tidak perlu mengubah
format lisensi maupun menerbitkan ulang kode yang sudah beredar.

Usulan pembagian:

- **Basic** — kasir, produk, laporan, kas bon, backup/restore
- **Pro** — + laporan laba & HPP, tutup kasir/shift, stok masuk, multi-user, cetak struk
- **Bisnis** — + sinkronisasi cloud, multi-outlet, dashboard owner

Aturan yang tidak boleh dilanggar: **penguncian tier tidak boleh menyandera data**, sama
seperti keputusan `/database-manager` tetap terbuka tanpa lisensi. Turun tier tidak boleh
membuat data yang sudah ada hilang atau tidak bisa diekspor.

## 13. Peran & hak akses (role)

Sekarang hanya ada admin vs bukan admin. POS profesional umumnya punya tiga tingkat:

- **Owner** — semua, termasuk laporan laba dan Database Manager
- **Supervisor** — bisa void/retur, ubah harga, tutup shift
- **Kasir** — jual, lihat laporan hari ini saja; tidak bisa ubah harga, tidak bisa lihat
  laba, tidak bisa void tanpa persetujuan supervisor

Ini menjadi wajib begitu #3 (void/retur) dan #4 (laba) ada — tanpa role, fitur void
justru menjadi cara termudah menghilangkan jejak transaksi.
