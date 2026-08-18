# Fase 17 — Dashboard Laporan + pisah "Hari Ini" vs "Keseluruhan"

## Context

Halaman Laporan sekarang ([laporan/+page.svelte](pos-app/src/routes/(app)/laporan/+page.svelte))
cuma punya 2 tab (Penjualan / Kas Bon), memuat **seluruh** riwayat sekali di `onMount()`,
lalu menjumlahkannya di JS. Tidak ada konsep tanggal sama sekali — tidak ada filter,
tidak ada angka "hari ini", tidak ada grafik.

Client minta (plan.md:178-190):
- angka **penjualan hari ini** sebagai fokus utama, reset tiap 24 jam, supaya bisa bikin target
- **dashboard grafik** penjualan + bon + barang apa saja yang terjual
- laporan **keseluruhan** dengan filter tanggal: hari ini / minggu ini / bulan ini / tahun ini
- hari ini dan keseluruhan **wajib dipisah tab**

Hasil akhir: Laporan jadi 4 tab — Dashboard · Hari Ini · Keseluruhan · Kas Bon.

### Keputusan yang sudah disepakati
1. **4 tab**, Kas Bon tetap punya tab sendiri (isinya tidak diubah).
2. **Bon tidak dijumlah** ke angka penjualan. "Penjualan Hari Ini" = uang tunai dari tabel
   `penjualan`. Bon baru & bon dibayar tampil sebagai kartu terpisah.
3. **Export Excel ikut filter aktif** (tab + rentang tanggal), nama file menyebut periodenya.

---

## Masalah timezone — harus dibereskan dulu

Ini prasyarat, bukan opsional. Fitur "hari ini" mustahil benar tanpa ini.

- **Penyimpanan**: kolom `tanggal` di `penjualan`, `kasbon`, `pembayaran_kasbon` pakai
  `DEFAULT (datetime('now'))` → **UTC**, format `"YYYY-MM-DD HH:MM:SS"`. Semua fungsi tulis
  (`simpanPenjualan` [penjualan.ts:54](pos-app/src/lib/db/penjualan.ts#L54),
  `simpanKasBon`, `bayarKasBon`) mengandalkan default ini.
- **Bug yang sudah ada**: `formatTanggal()` di
  [laporan/+page.svelte:33](pos-app/src/routes/(app)/laporan/+page.svelte#L33) dan
  [kasbon/+page.svelte:47](pos-app/src/routes/(app)/kasbon/+page.svelte#L47) melakukan
  `new Date(iso.replace(' ', 'T'))` — string tanpa `Z` diparse sebagai **waktu lokal**,
  padahal isinya UTC. Di WIB (UTC+7) tampilannya mundur 7 jam: transaksi jam 06:00 pagi
  18 Agt tersimpan `2026-08-17 23:00:00` dan **tampil sebagai 17 Agt**.
  Artinya ±7 jam pertama tiap hari kerja jatuh ke tanggal yang salah.

**Keputusan:** penyimpanan tetap UTC (jangan diubah — mengubah tulis akan bikin data lama
dan baru campur aduk dan tidak bisa dibedakan). Yang diperbaiki sisi baca:

- **Di SQL**: semua filter/grup pakai modifier `'localtime'` SQLite, yang mengonversi
  UTC → zona OS mesin toko. Contoh: `date(p.tanggal, 'localtime') BETWEEN $1 AND $2`.
- **Di JS**: parse string DB sebagai UTC (`new Date(s.replace(' ', 'T') + 'Z')`).
- Batas tanggal dikirim sebagai string lokal `YYYY-MM-DD` — **format yang sama** dengan
  yang sudah diemit `DatePicker.toISO()` ([DatePicker.svelte:51](pos-app/src/lib/components/DatePicker.svelte#L51)),
  jadi langsung nyambung tanpa konversi.

Efek samping yang disengaja: tanggal pada baris riwayat lama akan bergeser ke tanggal yang
benar setelah fix ini. Itu memang koreksi, bukan regresi.

**Tidak menambah migration.** Sempat dipertimbangkan `0004_*.sql` untuk index di
`penjualan(tanggal)`, tapi predikat `date(tanggal,'localtime')` tidak bisa memakai index
biasa, jadi manfaatnya nol sementara migration baru menambah risiko di mesin client
(lihat `repair_legacy_migration_checksums()` di [db_manager.rs](pos-app/src-tauri/src/db_manager.rs)).
Volume data kios kecil — full scan tidak terasa. Kalau nanti data membesar, solusinya kolom
generated + index, bukan index polos.

---

## Rencana implementasi

### 1. Util bersama (file baru)

**`pos-app/src/lib/utils/format.ts`**
- `formatRupiah(n)` — sekarang di-copy-paste identik di 4 halaman
  (laporan:29, kasbon:42, kasir:152, produk:81). Pindahkan ke sini.
- `parseWaktuDb(s)` — `new Date(s.replace(' ', 'T') + 'Z')`, satu-satunya tempat asumsi
  "DB itu UTC" ditulis.
- `formatTanggal(s)` / `formatWaktu(s)` / `formatTanggalJam(s)` — pakai `parseWaktuDb`.

Pemakaian: dipakai di halaman Laporan dan Kasbon (dua halaman yang menampilkan tanggal).
Halaman Kasir & Produk cukup ganti import `formatRupiah`-nya — perubahan satu baris.

Sekalian perbaiki [laporan/+page.svelte:109](pos-app/src/routes/(app)/laporan/+page.svelte#L109)
yang saat ini merender `{p.tanggal}` mentah (string UTC apa adanya) — ganti `formatTanggalJam(p.tanggal)`.

**`pos-app/src/lib/utils/periode.ts`**
- `type Periode = { dari: string; sampai: string }` (keduanya lokal `YYYY-MM-DD`).
- `hariIni()`, `mingguIni()`, `bulanIni()`, `tahunIni()` — dihitung dari `new Date()` lokal.
  Minggu dimulai Senin (konsisten dengan `hariLabel` di DatePicker yang mulai Minggu untuk
  grid kalender, tapi untuk periode bisnis Senin lebih masuk akal — pakai Senin).
- `labelPeriode(p)` untuk judul kartu & nama file Excel.

### 2. Query agregat (file baru)

**`pos-app/src/lib/db/laporan.ts`** — ikuti konvensi yang sudah ada di
[penjualan.ts](pos-app/src/lib/db/penjualan.ts): `const db = await getDb()` lalu
`db.select<Row[]>(sql, [params])`, snake_case → camelCase.

Semua parameter tanggal **di-bind `$1/$2`**, jangan interpolasi string (pola
`IN (${ids.join(',')})` yang ada sekarang aman karena id numerik dari DB, tapi jangan
ditiru untuk input tanggal).

```ts
export async function ringkasanPeriode(p: Periode): Promise<Ringkasan>
// SUM/COUNT dari penjualan, + bon baru (kasbon), + bon dibayar (pembayaran_kasbon)
// → { totalPenjualan, jumlahTransaksi, rataRata, bonBaru, jumlahBon, bonDibayar }

export async function penjualanPerHari(p: Periode): Promise<TitikGrafik[]>
// GROUP BY date(tanggal,'localtime') → [{ label, total, jumlah }]

export async function bonPerHari(p: Periode): Promise<TitikGrafik[]>
// bon baru dari kasbon, bon dibayar dari pembayaran_kasbon, digabung per tanggal

export async function penjualanPerJam(p: Periode): Promise<TitikGrafik[]>
// GROUP BY strftime('%H', tanggal, 'localtime') — untuk grafik jam di tab Hari Ini

export async function barangTerlaris(p: Periode, limit = 10): Promise<BarangTerjual[]>
// item_penjualan JOIN penjualan, GROUP BY nama (bukan barang_id — barang_id bisa NULL
// setelah ON DELETE SET NULL dari migration 0003, dan nama sudah disnapshot per baris)
// → [{ nama, totalQty, totalNilai }]
```

Kenapa nama tanggal-tanggal ini dihitung di SQL, bukan JS: `listPenjualan()` sekarang
memuat *seluruh* riwayat + seluruh item ke memori hanya untuk menjumlahkannya. Untuk
dashboard yang dibuka tiap hari itu makin lama makin berat, padahal `SUM`/`GROUP BY`
mengembalikan belasan baris saja.

**Modifikasi `penjualan.ts`**: `listPenjualan(p?: Periode)` — tambah parameter opsional.
Tanpa argumen perilakunya persis seperti sekarang, jadi pemanggil lain tidak terpengaruh.
Tambah `WHERE date(p.tanggal,'localtime') BETWEEN $1 AND $2` kalau ada argumen.

### 3. Komponen grafik (file baru, tanpa dependency)

**`pos-app/src/lib/components/BarChart.svelte`** — SVG bar chart yang ditulis tangan.

Alasan tidak menambah library: `package.json` sekarang hanya punya Tauri plugins + exceljs,
app-nya offline-first, dan yang dibutuhkan cuma bar chart. Menambah chart.js/d3 menaikkan
bundle & risiko build Windows demi satu grafik. Pola SVG tulis-tangan sudah dipakai di
[DatePicker.svelte:106](pos-app/src/lib/components/DatePicker.svelte#L106).

Props: `{ data: TitikGrafik[], tinggi?, formatNilai?, warna? }`.
Detail: warna dari `var(--accent)` supaya dark mode
([app.css:15-24](pos-app/src/app.css#L15-L24)) ikut jalan; `<title>` di tiap bar sebagai
tooltip native; `viewBox` + `width:100%` supaya responsif; kondisi data kosong ditangani
di dalam komponen.

**`pos-app/src/lib/components/BarList.svelte`** — daftar bar horizontal (div + `width: %`)
untuk "Barang Terlaris". Tidak perlu SVG.

### 4. Halaman Laporan — 4 tab

**`pos-app/src/routes/(app)/laporan/+page.svelte`**

Tab pakai pola yang sudah ada di file ini
([:70-77](pos-app/src/routes/(app)/laporan/+page.svelte#L70-L77) + CSS `:219-246`) —
`$state` + `class:active`, ditambah 2 tombol. Tidak mengekstrak komponen `Tabs.svelte`
supaya perubahan tetap terkurung di satu file; pola ini sudah jadi konvensi de-facto
(Pengaturan menyalinnya persis).

```ts
type Tab = 'dashboard' | 'hariIni' | 'keseluruhan' | 'bon';
let tab = $state<Tab>('dashboard');
```

**Tab 1 — Dashboard**
- 3 kartu ringkasan: Hari Ini · Bulan Ini · Keseluruhan (total + jumlah transaksi)
- `BarChart` penjualan 7 hari terakhir
- `BarChart` bon 7 hari terakhir (bon baru vs bon dibayar)
- `BarList` barang terlaris 30 hari terakhir

**Tab 2 — Hari Ini** (fokus utama)
- Angka besar: **total penjualan hari ini**
- Kartu pendukung: jumlah transaksi · rata-rata per transaksi · bon baru hari ini ·
  bon dibayar hari ini · uang masuk (tunai + bon dibayar)
- `BarChart` penjualan per jam hari ini
- Tabel transaksi hari ini (reuse markup baris + expand yang sudah ada)
- **Reset otomatis**: `setInterval` 60 detik membandingkan `hariIni().dari` dengan nilai
  yang sedang ditampilkan; kalau tanggal berganti → refetch. Ini menjawab "24 jam baru
  dia reset" tanpa user harus restart app yang menyala semalaman. Interval di-`clearInterval`
  di cleanup `$effect`.

**Tab 3 — Keseluruhan**
- Baris preset: `Hari Ini · Minggu Ini · Bulan Ini · Tahun Ini · Custom`
- Kalau Custom → dua `DatePicker` (dari / sampai), komponen sudah ada dan sudah
  mengemit `YYYY-MM-DD` lokal
- Kartu ringkasan periode + `BarChart` per hari + tabel transaksi (refetch tiap filter berubah)

**Tab 4 — Kas Bon** — markup & logika persis seperti sekarang, tidak disentuh.

### 5. Export Excel ikut filter

**`pos-app/src/lib/export/excel.ts`** — tambah parameter opsional, jangan ubah struktur sheet:

```ts
export async function exportLaporanExcel(
  penjualan: Penjualan[],
  kasbon: KasBon[],
  opts?: { judul?: string; namaFile?: string }
): Promise<boolean>
```

- `judul` menggantikan judul hardcoded `'Laporan Penjualan'` (:118) dkk, jadi mis.
  `"Laporan Penjualan — 18 Agt 2026"`.
- `namaFile` menggantikan `Laporan-${formatTanggalFile()}` (:264), jadi mis.
  `Laporan-HariIni-2026-08-18.xlsx`.
- Tanpa `opts`, perilakunya persis seperti sekarang.

Di halaman: tombol export mengirim array yang **sudah difilter** sesuai tab aktif —
tab Hari Ini kirim data hari ini, tab Keseluruhan kirim data rentang aktif, tab Dashboard
& Kas Bon kirim semua.

---

## File yang disentuh

| File | Aksi |
|---|---|
| `pos-app/src/lib/utils/format.ts` | **baru** — formatRupiah, parseWaktuDb, formatTanggal/Jam |
| `pos-app/src/lib/utils/periode.ts` | **baru** — preset rentang tanggal |
| `pos-app/src/lib/db/laporan.ts` | **baru** — query agregat SUM/GROUP BY |
| `pos-app/src/lib/components/BarChart.svelte` | **baru** — SVG bar chart |
| `pos-app/src/lib/components/BarList.svelte` | **baru** — bar horizontal |
| `pos-app/src/routes/(app)/laporan/+page.svelte` | **ubah besar** — 4 tab, filter, grafik |
| `pos-app/src/lib/db/penjualan.ts` | **ubah kecil** — `listPenjualan(p?: Periode)` |
| `pos-app/src/lib/export/excel.ts` | **ubah kecil** — opts judul & namaFile |
| `pos-app/src/routes/(app)/kasbon/+page.svelte` | **ubah kecil** — pakai util format bersama |
| `pos-app/src/routes/(app)/kasir/+page.svelte`, `produk/+page.svelte` | **ubah kecil** — import `formatRupiah` |
| `pos-app/src/lib/types/index.ts` | tambah tipe `TitikGrafik`, `Ringkasan`, `BarangTerjual` |

Tidak ada perubahan schema, tidak ada file migration baru, tidak ada dependency baru.

---

## Verifikasi

1. `cd pos-app && npm run check` — svelte-check harus bersih.
2. `npm run tauri dev`, lalu di app:
   - **Timezone** (yang paling penting): buat 1 transaksi baru di Penjualan, langsung buka
     Laporan → tab Hari Ini. Transaksi itu **wajib** muncul dan ikut terhitung, apa pun
     jam saat tes. Tes ini paling bermakna kalau dijalankan pada jam 00:00–07:00 WIB —
     itu justru window yang salah pada implementasi lama.
   - Bandingkan tanggal transaksi lama di tab Keseluruhan sebelum & sesudah fix; yang
     tadinya mundur sehari sekarang harus benar.
   - **Hari Ini**: total = jumlah transaksi hari ini saja, dan **tidak** termasuk bon
     (bikin 1 bon baru → angka penjualan tidak berubah, kartu "Bon Baru" yang naik).
   - **Keseluruhan**: klik tiap preset (hari/minggu/bulan/tahun), pastikan angka membesar
     secara monoton; custom range lewat DatePicker juga jalan.
   - **Dashboard**: grafik muncul, dan tetap tidak pecah saat data kosong (uji dengan
     rentang tanggal yang tidak punya transaksi).
   - **Export**: dari tab Hari Ini → file Excel hanya berisi baris hari ini dan judul
     sheet menyebut tanggalnya.
   - **Dark mode**: cek grafik terbaca di kedua tema (toggle di Pengaturan → Umum).
3. Reset harian: ubah jam sistem ke lewat tengah malam sambil app terbuka di tab Hari Ini —
   dalam ≤60 detik angka harus reset ke 0 tanpa restart.
4. Catat di [list_done.md](docs/list_done.md) sesuai konvensi (`tanggal - nama fitur - commit hash`).
   Commit hanya kalau diminta.
