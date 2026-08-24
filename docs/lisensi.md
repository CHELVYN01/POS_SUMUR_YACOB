# Fase 21 — Lisensi & Aktivasi

Dokumen ini adalah **satu-satunya sumber kebenaran format lisensi**. Formatnya
diimplementasikan dua kali — TypeScript di `web-kios-pos` (penerbit) dan Rust di
`pos-app` (pemeriksa) — jadi setiap perubahan di sini harus diikuti dua-duanya.

## Context

Aplikasi dijual lewat `web-kios-pos`. Pembeli membayar, memasang aplikasi, lalu
menukar nomor pesanan dengan kode lisensi yang **dikunci ke komputer itu**.

Dua kendala membentuk seluruh desain:

1. **Aplikasi wajib jalan offline penuh.** Kasir warung tidak boleh gagal jualan
   karena internet mati, jadi keaslian kode harus bisa dibuktikan tanpa menghubungi
   server sama sekali.
2. **Batas perangkat harus benar-benar ditegakkan.** Kalau kode tidak memuat identitas
   mesin, menyalinnya ke komputer kedua akan berhasil — komputer kedua tidak punya
   cara tahu komputer pertama sudah memakainya.

Jawaban dari keduanya sekaligus: kode ditandatangani **dan** memuat ID Mesin.
Penghitungan kuota terjadi sekali di website saat penebusan; sesudah itu aplikasi
tidak pernah butuh jaringan lagi.

## Alur

```
1. Pembeli bayar                    → website simpan order, status paid
2. Halaman sukses                   → tampilkan NOMOR PESANAN (bukan kode)
3. Pembeli pasang app, buka         → app tampilkan ID Mesin: A110-08AD-95CE-101B
4. Pembeli buka /aktivasi (boleh    → isi nomor pesanan + ID Mesin
   dari HP, bukan dari komputer        website cek kuota, terbitkan kode ber-`m`,
   kasir)                              catat mesinnya di tabel aktivasi
5. Tempel kode di app               → app cocokkan `m` dgn dirinya sendiri, offline
```

Kode dari langkah 4 disalin ke komputer lain → `m` tidak cocok → **ditolak**.

## Keputusan desain (dikonfirmasi user)

1. **Tanda tangan asimetris, bukan panggilan server.** Private key ada di server
   website, public key ditanam di binary aplikasi. Aplikasi memverifikasi tanda tangan
   secara lokal — tidak pernah ada koneksi keluar untuk urusan lisensi.
2. **Aktivasi dua langkah.** Kode diterbitkan saat *penebusan*, bukan saat pembayaran,
   karena ID Mesin belum diketahui saat orang membayar. Yang butuh internet cuma
   langkah menebus, dan itu boleh dilakukan dari perangkat lain (HP) — komputer kasir
   sendiri tidak pernah online.
3. **Satu kode = satu mesin, dan kuotanya dihitung.** Tabel `aktivasi` di website
   mencatat tiap (pesanan, ID mesin). Pro berhenti di 3 mesin. Menebus ulang dari mesin
   yang **sama** mengembalikan kode lama dan tidak memotong kuota — pembeli yang
   kehilangan kodenya bukan pencuri.
4. **Tier ikut ditandatangani di dalam kode**, dibaca aplikasi dan ditampilkan di
   Pengaturan. Penguncian fitur per tier belum dipasang di fase ini — mekanismenya
   sudah ada, pembatasannya menyusul tanpa perlu ganti format.
5. **Lisensi disimpan di luar database.** Bukan tabel SQLite, tapi file di
   `app_config_dir`. Alasannya: lisensi milik *mesin*, bukan milik *data*. Kalau
   ikut di dalam `pos.db`, Restore backup dari mesin lain akan membawa lisensi mesin
   itu (langsung tidak cocok), dan "Buat Baru" di Database Manager akan menghapus
   lisensi yang sah.

## Format kode

```
KIOS1.<payload>.<signature>
```

- `KIOS1` — penanda format sekaligus versi. Naikkan angkanya kalau struktur berubah.
- `<payload>` — JSON, base64url **tanpa padding**.
- `<signature>` — Ed25519 (64 byte) atas string ASCII `KIOS1.<payload>`, base64url
  tanpa padding.

Yang ditandatangani adalah teks `KIOS1.<payload>` apa adanya — **bukan** hasil parse
JSON-nya. Ini menghindari seluruh kelas bug kanonikalisasi (urutan key, spasi,
escaping unicode) yang muncul kalau dua bahasa harus menghasilkan byte JSON identik.

### Isi payload

Key sengaja pendek — tiap karakter payload jadi ~1,33 karakter kode yang harus disalin.

| Key | Tipe | Arti |
|---|---|---|
| `v` | number | Versi payload (sekarang `1`) |
| `t` | string | Tier: `basic` \| `pro` \| `bisnis` |
| `d` | number | Batas perangkat paket. `0` = tanpa batas |
| `k` | number | Kode ke-berapa dari pesanan ini (1..d) |
| `s` | string | Nomor pesanan, mis. `KP-20260824-A1B2` |
| `n` | string | Nama pemilik/toko, ditampilkan di aplikasi |
| `i` | string | Tanggal terbit, `YYYY-MM-DD` |
| `x` | string \| null | Tanggal kedaluwarsa, `null` = selamanya |
| `m` | string? | ID Mesin yang dikunci ke kode ini, `A110-08AD-95CE-101B`. Kalau ada, aplikasi mewajibkan cocok |

`m` menyimpan **bentuk tampilan** ID Mesin (16 hex berkelompok empat), bukan hash
penuh 64 karakternya — nilai inilah yang dibacakan pembeli dari layar ke formulir
aktivasi. Saat mencocokkan, aplikasi membuang tanda hubung dan menyeragamkan huruf,
jadi `a110 08ad 95ce 101b` dan `A11008AD95CE101B` sama-sama diterima.

Kode **tanpa** `m` tetap sah dan berlaku di komputer mana pun. Bentuk itu masih dipakai
CLI untuk penjualan manual dan pengujian; jangan diterbitkan untuk pembeli biasa.

Contoh payload sebelum di-encode:

```json
{"v":1,"t":"pro","d":3,"k":2,"s":"KP-20260824-A1B2","n":"Toko Budi","i":"2026-08-24","x":null,"m":"A110-08AD-95CE-101B"}
```

Panjang kode jadinya ±210 karakter. **Menyalin, bukan mengetik**, adalah jalur yang
dimaksudkan: halaman sukses menyediakan tombol Salin dan unduhan berkas `.lic`, dan
layar aktivasi aplikasi menerima tempel maupun impor berkas. Tanda tangan Ed25519
sendiri sudah 64 byte dan tidak bisa dipendekkan tanpa kehilangan sifat
tidak-bisa-dipalsukan — memakai rahasia simetris memang menghasilkan kode ~20
karakter, tapi siapa pun yang membongkar binary bisa bikin keygen sendiri.

## Sidik jari mesin

Diambil dari identitas mesin bawaan OS lewat crate `machine-uid`:

| OS | Sumber |
|---|---|
| Windows | Registry `HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid` |
| Linux | `/etc/machine-id` (fallback `/var/lib/dbus/machine-id`) |
| macOS | `IOPlatformUUID` |

Nilainya di-hash `SHA-256` bersama garam tetap, lalu 16 hex pertama ditampilkan
berkelompok: `A1B2-C3D4-E5F6-7890`. Yang disimpan & dibandingkan adalah hash-nya,
bukan ID mesin mentahnya.

Kalau OS gagal memberi ID (jarang, tapi mungkin di container atau Linux tanpa
`/etc/machine-id`), aplikasi membuat ID acak sekali lalu menyimpannya di
`mesin.id` — aktivasi tetap jalan, hanya saja penandanya tidak lagi terikat hardware.

**Sidik jari berubah kalau OS dipasang ulang.** Lisensi jadi tidak cocok dan pembeli
harus minta kode baru. Ini konsekuensi yang disengaja dari model tanpa server, dan
harus disebut di halaman FAQ website.

## Penyimpanan & pemeriksaan di aplikasi

`app_config_dir/lisensi.json`:

```json
{ "kode": "KIOS1.…", "mesin": "<hash sidik jari>", "aktifSejak": "2026-08-24T02:11:00Z" }
```

Diperiksa ulang **setiap aplikasi dibuka**, bukan cuma saat aktivasi:

1. Pisah kode jadi tiga bagian, tolak kalau penanda bukan `KIOS1`.
2. Verifikasi tanda tangan dengan public key yang ditanam.
3. Cocokkan `mesin` di berkas dengan sidik jari mesin saat ini.
4. Kalau payload punya `m`, cocokkan juga dengan sidik jari sekarang.
5. Kalau `x` terisi dan sudah lewat, lisensi kedaluwarsa.

Karena tanda tangan diperiksa ulang tiap kali, mengedit `lisensi.json` dengan tangan
tidak menghasilkan apa-apa — tier yang diubah akan membuat tanda tangannya gagal.

## Saat lisensi tidak sah

Aplikasi terkunci di layar aktivasi: tidak bisa login, tidak bisa jualan. Tapi
**Database Manager tetap bisa dibuka** dari layar itu, supaya pemilik toko selalu
bisa mengambil backup datanya sendiri. Data pembeli tidak boleh jadi sandera.

## Penegakan kuota perangkat

Ada di website, di `src/lib/server/lisensi/aktivasi.ts` dan tabel `aktivasi`
(SQLite, lihat `src/lib/server/db/`). Aturannya:

- `UNIQUE (order_id, id_mesin)` — mesin yang sama tidak bisa memakan dua slot.
- Menebus dari mesin yang sudah terdaftar mengembalikan kode lamanya, kuota tetap.
- Mesin baru ditolak kalau jumlah baris untuk pesanan itu sudah mencapai
  `plan.maxDevice`. `maxDevice: 0` (paket Bisnis) berarti tanpa batas.
- Pesanan yang belum `paid` tidak bisa menebus apa pun.

Nomor pesanan efektif jadi kunci rahasia — siapa pun yang tahu nomornya bisa
menghabiskan slot. Karena itu bagian acaknya 64 bit (`generateOrderId`), bukan 32.

## Batas yang diketahui (jujur, bukan diabaikan)

- **Tidak ada pencabutan (revocation).** Kode yang sudah terbit berlaku selamanya di
  mesinnya; refund tidak bisa mematikannya dari jauh. Melepas lisensi di aplikasi
  hanya menghentikan pemakaian di komputer itu, tidak mengembalikan slot ke website.
  Slot dikosongkan manual dengan menghapus barisnya di tabel `aktivasi`.
- **Sidik jari mesin bukan anti-rekayasa.** Ia dibaca dari identitas OS; orang yang
  cukup niat bisa memalsukannya, sama seperti orang yang cukup niat bisa menambal
  binary-nya. Yang ditutup di sini adalah penyalinan biasa — pembeli yang memasang
  aplikasinya di 5 komputer sekaligus — bukan pembongkaran serius.
- **`.data/kios-pos.db` butuh filesystem permanen.** Kalau website di-deploy ke
  platform serverless (Vercel/Netlify), berkasnya hilang tiap instance diganti dan
  seluruh catatan aktivasi ikut hilang. Pindah ke Postgres/Turso sebelum deploy ke sana.

## Kunci

Sepasang kunci Ed25519 dibuat sekali:

```bash
cd web-kios-pos && npm run lisensi:kunci
```

- **Private key** → `.env` website sebagai `LICENSE_PRIVATE_KEY` (PKCS#8 PEM satu baris).
  Jangan pernah di-commit. Kalau bocor, siapa pun bisa menerbitkan lisensi.
- **Public key** → konstanta `PUBLIC_KEY_HEX` di `pos-app/src-tauri/src/lisensi.rs`.
  Mengganti pasangan kunci berarti semua lisensi lama mati — jangan diganti setelah
  ada penjualan.

## Penjualan manual

Untuk transaksi di luar website (transfer bank, WhatsApp):

```bash
# terikat mesin — sama amannya dengan yang lewat website
npm run lisensi -- --tier pro --nama "Toko Budi" --mesin A110-08AD-95CE-101B

# tanpa ikatan mesin — berlaku di komputer mana pun, pakai hanya untuk pengujian
npm run lisensi -- --tier basic --nama "Warung Sari"
```

CLI tidak menyentuh tabel `aktivasi`, jadi kuota kode terbitan manual tidak ikut
terhitung. Catat sendiri kalau memakainya untuk penjualan sungguhan.

## Catatan rilis pertama

Aplikasi yang sudah terpasang di client (Sumur Yacob) akan **ikut terkunci** begitu
versi berlisensi dipasang. Terbitkan kode untuk mesin itu lebih dulu lewat CLI dan
aktifkan sesudah update, atau jangan update mesin itu sampai kodenya siap.
