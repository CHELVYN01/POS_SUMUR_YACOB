saya ingin membuat sistem pos untuk kios atau warung kecil saya dimana kasih ini sederhanan saja 
teknologi yang ingin saya gunakan adalah tauri dari rust. 

untuk kebutuhan fitur ada lah 
requirment client 
sistem pos menggunakan 


- input barang harga dan (buat jumlah barang stock di lepass)
- langsung jual brang nya (dengan menggunakan barcode)
- bisaa edit harga jika ada kenaikan atau bonus 
- barcode 

- laporan penjualan hari ini (exel)
- user

- offline 
- back data di internet 

## plan fase
plan fase 1 ✅
nah plan nya kita mulai hari ini 
- install tauri 
- buat struktur file 
- buat claude md file 
- buat list_done.md file 

di dalam list_done formatnya adalah 
contoh 
tanggal pengerjaan - nama feat - gitcommit nya 

oke untuk plan hari ini itu dulu 


plan fase 2 ✅
buat ui nya dulu dah 
- thema putih tapi tidak cerah banget, minimalis stylenya gaya enak di lihat aja  
- fitur login simpel 
- sidebar 
- terus input barang harga dan qty (kalo perlu tidak wajib untuk qty)
- jual barang 
- buat dami data simpel dari user dan baran dan list penjalan cukup 3 aja 
- init untuk kios barang sembako yah yang mana tidak di butuhkan gambar yang penting nama barang nya aja 
kenapa saya buat ui nya dulu saya suka melihat ui nya dulu kerena itu penting apa yang harus saya tambahkan dan tidak nanti nya 


plan fase 3 ✅
- buat database nya 
- dan buat crud data base nya 
- setup yang sqllite dulu yah 
- Tambah query tambahUser & hapusUser (dengan proteksi admin terakhir)
- Cek username unik saat tambah user
- Update UI Pengaturan: form tambah user + tombol hapus, khusus admin
- Verifikasi type-check & cargo check


plan fase ke 4 ✅
- ada log di bagian jual barang dan input barang 
ini berguna untuk lihat historikal scand add barang gitu 
log nya cuman 24 jam setalah itu hilang gitu, dengan begitu kita bisa tahu ada kesalan dalam penjualn dan input barang bahkan scann


plan fase 5 ✅
- pertama ganti logo nya 
- dan buat spalsh 
- pada saat buka tampilan penu tidak ada kasih kecil layar dan perbebesar laya 
- icon apk pake logo bar yah 
- logo bar juga untuk sidebar logo yah 
D:\bisnis\freelance\POS_SUMUR_YACOB\pos-app\img


plan fase 6 ✅
- ubah list title di side bar jadi prodfesional dengan ada nya icon di seblah kiri 
- terus letakan nama scan di samping kiri mode dark, ini berfungsi mengecek apakah scan kita terkonek 
- terus pada saat klik bayar muncul pop up invoice terus kita bisa klik bayar gitu jadi ada muncul pop up nya 

plan fase 7 ✅
- Kios Sumur Yacob di ganti dinamis tidak hardcode 
- buat setting untuk nama toko dan alamatnya yang mana akan di tampilkan di sidebar 
- sidebar untuk logo di atas kasih tinggi lagi terus ada backgoru yang menarik dah gitu 

plan fase 8 ✅
- fitur baru namanya kas bon 
- fitur ini ada input nama
- barang yang dia bon
- input tanggal untuk dia bayar 
- kelo dia bayar cicil atau lunas 
- terus confirm 

pan fase 9 ✅
- saya ingin fitur scanner di penjualan dan input barang itu bisa 
- jadi input barang itu saya ingin pada saat scan barcode nya dia langsung muncul di input barcode 
- untuk penjualn pada saat scan dia langsung menginput barang secara otomatis 

plan fase 10 ✅
- ubah list penjualan jadi laporan saja 
- di dalam ada laporang penjulan dan bon 


plan fase 11 ✅
- buat kan saya expor excel di laporan 
- tiga shet (dashboard keselurahan laporan penjualan dan bon , lopran penjualan dan bon)


plan fase 12 ✅
- sinkron data 
oke disini kamu jangan coding dulu kita bahas sinkron data 
saya ada case gini jadi saya mau kita bisa backup data otomatis atau menggunakan file zip
- jadi pada saat saya download di laptop lain saya dan mameasukan file zip nya maka data di laptop itu semua nya langsung tersisi dari input barang dan bon dan laporan 
- nah saya ingin dia bisa di download juga bisa simpan di db gitu 
- untuk download bentuk file nya zip
- jadi misla kita import data backup atau kita restore datanya kembali semua gitu kaya di odoo gitu 

plan fase 13

Fase 12 — Backup & Restore Data (via ZIP)
Backup (manual, tombol di Pengaturan):

User klik "Backup Data"
Rust command copy pos.db (+ .db-wal/.db-shm kalau ada) → zip
Save dialog → user pilih lokasi simpan, nama default backup-pos-YYYYMMDD-HHMMSS.zip
Restore (manual, tombol di Pengaturan):

User klik "Restore Data" → open dialog pilih file .zip
Warning keras: "Semua data saat ini akan ditimpa total dan tidak bisa dibatalkan. Lanjutkan?"
Rust command: backup dulu pos.db lama → pos.db.bak (safety net) → extract zip → validasi file db valid → replace pos.db
App auto-restart (relaunch) supaya koneksi SQLite fresh
Scope fase ini:

Manual only (bukan auto-backup terjadwal — itu fase terpisah nanti)
Local file save only (belum upload ke Supabase — nyusul fase lain)
Replace total, bukan merge
Perubahan teknis:

Cargo.toml: tambah crate zip
src-tauri/src/: command baru backup_database & restore_database
pengaturan/: UI 2 tombol + dialog konfirmasi restore
Ini sudah cukup jelas untuk mulai coding. Mau saya lanjut implementasi sekarang, atau ada bagian yang mau disesuaikan dulu?

# importan (saya ingin desain backup data dan resote itu kaya odoo jadi di form login ada management database jika kita klik itu maka akan muncul tampilan databasae seperti di odoo di mana kita bisa hapus restoe dan backup bahkan duplikat dan buat baru ini sangat penting yah)

fase 13 ✅ (hasil pengerjaan, komit d3bbdd9)
- halaman /database-manager terpisah, diakses dari link kecil di bawah form login (bukan tombol di Pengaturan seperti rencana awal fase 12, sesuai catatan "importan" di atas)
- dilindungi master password terpisah dari login user (default admin123, argon2 hash, bisa diubah admin dari Pengaturan)
- Backup: checkpoint WAL lalu compress pos.db ke .zip, save dialog nama default backup-pos-YYYYMMDD-HHMMSS.zip
- Restore: pilih file .zip, validasi magic header SQLite, warning keras + konfirmasi ketik "RESTORE", lalu app restart
- Buat Baru (reset): backup otomatis dulu (pos.db.bak-<timestamp>), form admin baru, warning keras + konfirmasi ketik "RESET", database dikosongkan lalu diisi 1 admin baru, app restart
- fitur Duplikat dicoret sesuai arahan user (scope tetap 1 database aktif, bukan multi-database)
- teknis: restore/reset tidak pernah menimpa pos.db saat proses masih hidup (Windows file-locking) — file swap terjadi di awal proses baru sebelum plugin SQL mount; seed data awal (admin+barang contoh) dipindah dari migration ke logic frontend supaya reset bisa hasilkan database benar-benar kosong
- tambahan di luar rencana awal: halaman Pengaturan diubah dari 1 kolom panjang jadi tab (Umum/User/Sinkronisasi/Keamanan), mengikuti pola tab yang sudah ada di Laporan



## plan fix 
plan fix 1 ✅
- perbaiki tampilan login 
- perbaiki tampilan splash 

plan fix 2 ✅
- di penjualan pada saat mau bayar tambahkan fitur untuk input uang yang di kasih 
contoh pembeli punya uang 100k dan dia beli gula pasih sebesar 50k nah kasih nanti harus input uang si 
pembeli, jadi nanti uang pembeli di kurangi total brang beli dan hasil nya dapat baru kita klik bayar baru muncul invoice dan kita konfirmasih bayar gitu 

plan fix 3 ✅
- tomobol hapus di input barang tidak berfungsi ada error 
+page.svelte:151 Uncaught (in promise) error returned from database: (code: 787) FOREIGN KEY constraint failed











## wajib saya running sendiri 




