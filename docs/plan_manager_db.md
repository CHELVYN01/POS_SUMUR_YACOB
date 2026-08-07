# Fase 13 — Database Manager (Backup / Restore / Buat Baru) ala Odoo

## Context

Client ingin kemampuan backup/restore data lewat file ZIP (fase 12), tapi bukan
sekadar tombol di halaman Pengaturan — client secara eksplisit minta pengalaman
seperti **Database Manager Odoo**: diakses dari layar login, punya proteksi
password terpisah, dan bisa Backup / Restore / **Buat Baru** (reset ke kondisi
kosong). Fitur "Duplikat" sudah dicoret oleh user. Arsitektur tetap **satu
database aktif** (`pos.db`), bukan multi-database sungguhan — jadi "Buat Baru"
berarti mereset database yang sama, bukan membuat file db kedua untuk dipilih.

Ini command Rust custom pertama di project (sejauh ini `lib.rs` cuma memasang
plugin). Tantangan inti: `pos.db` (SQLite, WAL mode) dipegang live oleh
`tauri-plugin-sql` di proses yang sama, dan Windows strict soal replace file
yang sedang open. Solusi: restore/reset tidak pernah menimpa `pos.db` saat app
masih hidup — mereka menyiapkan file `.pending`, lalu app restart, dan file
swap terjadi di awal proses baru **sebelum** ada koneksi SQL yang dibuka.

## Keputusan desain

| Aspek | Keputusan |
|---|---|
| File replace | Tidak pernah menimpa `pos.db` saat proses hidup — tulis `pos.db.pending`, swap terjadi di awal `run()` proses baru sebelum window/Svelte sempat manggil `getDb()` |
| Reset | Backup ke `pos.db.bak-<timestamp>` → hapus `pos.db`+wal/shm lama → biarkan tauri-plugin-sql re-run migration dari nol saat restart (bukan DROP TABLE di koneksi live) |
| Seed data | Dipindah keluar dari `0001_initial.sql` ke logic Rust "seed on first run", supaya reset menghasilkan db benar-benar kosong sebelum diisi 1 admin baru dari form |
| Restart | `tauri-plugin-process`, command custom `relaunch_app` → `app.restart()` |
| Zip | crate `zip` v2 (fitur `deflate` saja), validasi magic header 16-byte SQLite (`b"SQLite format 3\0"`) sebelum diterima sebagai backup valid |
| Master password | File JSON terpisah di app **config** dir (bukan `pos.db`, karena reset/restore bisa menghapusnya) — `argon2` hash, default `admin123` (hash di-hardcode, bukan plaintext), bisa diubah admin dari Pengaturan |
| Safety net | Setiap restore/reset SELALU backup otomatis dulu sebelum mengubah apapun |
| Duplikat | Dicoret — tidak diimplementasikan |

## Rust backend — `pos-app/src-tauri/src/db_manager.rs` (baru)

Command baru (semua `Result<T, String>` supaya frontend bisa tampilkan error):
- `backup_database(app, dest_path: String)` — copy `pos.db` ke zip di `dest_path` (path didapat dari save dialog di frontend, sama seperti pola `dialog:allow-save` yang sudah ada). Frontend jalankan `PRAGMA wal_checkpoint(TRUNCATE);` via `getDb()` sebelum invoke, supaya WAL sudah ter-flush.
- `validate_zip_backup(zip_path: String)` — buka zip, cari entry `pos.db`, cek 16 byte magic header. Dipanggil sebelum tampilkan warning restore, supaya user dapat feedback cepat kalau salah pilih file.
- `restore_database(app, zip_path: String)` — validasi ulang (defense in depth) → extract entry `pos.db` ke `pos.db.pending` di app data dir. **Tidak** menyentuh `pos.db` asli. Return sukses, frontend lalu panggil `relaunch_app`.
- `reset_database(app, admin_nama, admin_username, admin_password)` — backup `pos.db` → `pos.db.bak-<timestamp>`, hapus `pos.db`/`-wal`/`-shm` lama, tulis `pos.db.seed-pending.json` berisi payload admin baru. Return sukses, frontend panggil `relaunch_app`.
- `relaunch_app(app)` — panggil `app.restart()` dari `tauri-plugin-process`.
- `verify_master_password(app, password: String) -> bool` — baca `db-manager-auth.json` dari app config dir; kalau belum ada, bandingkan ke hash default hardcoded (`admin123`).
- `set_master_password(app, old_password, new_password)` — verify dulu, lalu tulis/timpa file hash baru. Dipanggil dari Pengaturan (admin only), bukan dari halaman Database Manager.

Helper `apply_pending_db_swap_if_any()` — dipanggil **paling awal** di `run()`,
sebelum `tauri::Builder::default()...plugin(tauri_plugin_sql...)` dipasang:
- Kalau `pos.db.pending` ada → backup `pos.db` lama ke `pos.db.bak` (copy), hapus wal/shm lama, `fs::rename(pending, pos.db)`.
- Kalau `pos.db` sudah dihapus oleh reset (tidak ada file) → biarkan, plugin sql akan create+migrate fresh.
- Path di-resolve manual (tanpa `AppHandle`, karena dipanggil sebelum builder ada) — gunakan `dirs::config_dir()` + `"com.cj.pos-app"` (cocokkan dengan `identifier` di `tauri.conf.json`). **Verifikasi dengan print `app.path().app_data_dir()` sekali saat implementasi** untuk pastikan path Windows persis sama (`C:\Users\<user>\AppData\Roaming\com.cj.pos-app`).

Seed-on-first-run logic (mengganti INSERT yang dihapus dari migration):
- Setelah plugin sql ter-mount, cek tabel `users` kosong:
  - Kalau ada `pos.db.seed-pending.json` (hasil reset) → insert 1 admin dari situ, hapus file marker.
  - Kalau fresh install (tidak ada marker apapun) → insert seed default yang sekarang (admin `sumuryacob`/`yacob` + 8 barang contoh), sama seperti isi `0001_initial.sql` saat ini.

## Migration — `pos-app/src-tauri/migrations/0001_initial.sql`

Hapus 2 blok `INSERT INTO users...` dan `INSERT INTO barang...` di baris 37-48
(schema DDL saja). Seed data dipindah ke logic Rust di atas.

## Cargo.toml (`pos-app/src-tauri/Cargo.toml`)

Tambah:
```toml
zip = { version = "2", default-features = false, features = ["deflate"] }
argon2 = "0.5"
tauri-plugin-process = "2"
dirs = "5"
```

## `lib.rs`

- `mod db_manager;`
- Panggil `db_manager::apply_pending_db_swap_if_any();` sebagai baris pertama di `run()`, sebelum `tauri::Builder::default()`.
- Tambah `.plugin(tauri_plugin_process::init())`.
- Tambah `.invoke_handler(tauri::generate_handler![...7 command di atas...])`.
- Panggil seed-on-first-run logic di dalam `.setup(|app| {...})`.

## Capabilities — `pos-app/src-tauri/capabilities/default.json`

Tambah `"dialog:allow-open"` (untuk pilih file `.zip` saat restore — saat ini cuma ada `allow-save`) dan `"process:allow-restart"`.

## Frontend

**Baru** `pos-app/src/lib/db-manager/index.ts` — wrapper tipis di atas `invoke()` untuk ke-7 command (lihat detail signature di hasil eksplorasi agent Plan).

**Baru** `pos-app/src/routes/database-manager/+page.svelte` — di luar route group `(app)`, jadi tidak kena auth guard. State machine: `auth → menu → (backup | restore-confirm | reset-form) → processing → done/error`.
- **auth**: input master password, styling senada `+page.svelte` login (pakai `.card`, variabel CSS yang sama).
- **menu**: 3 kartu aksi Backup / Restore / Buat Baru + link "Kembali ke Login".
- **Backup**: `save()` dialog (default nama `backup-pos-YYYYMMDD-HHMMSS.zip`) → checkpoint WAL via `getDb()` → invoke `backup_database` → tampilkan hasil, tanpa restart.
- **Restore**: `open()` dialog pilih `.zip` → `validate_zip_backup` → warning keras (konfirmasi eksplisit, bukan cuma satu klik) → invoke `restore_database` → invoke `relaunch_app`.
- **Buat Baru**: warning keras → form admin baru (nama, username, password, konfirmasi) → invoke `reset_database` → invoke `relaunch_app`.

**Ubah** `pos-app/src/routes/+page.svelte` — tambah link kecil `<a href="/database-manager">` di bawah tombol "Masuk" di dalam `.login-box`, styled muted/kecil.

**Ubah** `pos-app/src/routes/(app)/pengaturan/+page.svelte` — tambah section "Ubah Master Password Database Manager" (tampil hanya kalau `isAdmin`, ikut pola yang sudah ada di file itu), panggil `setMasterPassword()`.

## Urutan implementasi

1. Cargo.toml: tambah 4 dependency.
2. Refactor `0001_initial.sql`: hapus seed INSERT.
3. Buat `db_manager.rs`: semua command + helper swap + seed-on-first-run.
4. Update `lib.rs`: wiring plugin, invoke_handler, swap call, setup hook.
5. Update `capabilities/default.json`.
6. Frontend: `lib/db-manager/index.ts` wrapper.
7. Frontend: halaman `database-manager/+page.svelte`.
8. Frontend: link di login page.
9. Frontend: section master password di Pengaturan.
10. `cargo check` + `npm run check` (type-check) untuk verifikasi build.

## Verifikasi end-to-end (manual, oleh user — sesuai catatan project "wajib saya running sendiri")

- Backup normal → zip valid, isi `pos.db` benar saat dibuka manual.
- Restore dengan zip valid → app restart → data berubah sesuai isi backup, `pos.db.bak` muncul di app data dir.
- Restore dengan file invalid (bukan zip / tanpa `pos.db` / bukan SQLite) → error jelas, tidak ada file ke-swap.
- Reset → isi form admin baru → restart → login admin baru sukses, tabel barang/penjualan kosong, `pos.db.bak-<timestamp>` muncul.
- Master password: fresh install pakai `admin123` berhasil; ubah lewat Pengaturan; verifikasi password lama ditolak, password baru diterima.
- Tidak ada leftover `*.pending` / `*.seed-pending.json` yang nyangkut setelah siklus backup→restore→reset berulang.

Sesuai instruksi project, saya tidak akan menjalankan `npm run tauri dev` /
build app sendiri — user yang akan running dan test manual setelah kode selesai.

Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach.

In plan mode, you should:
1. Thoroughly explore the codebase to understand existing patterns
2. Identify similar features and architectural approaches
3. Consider multiple approaches and their trade-offs
4. Use AskUserQuestion if you need to clarify the approach
5. Design a concrete implementation strategy
6. When ready, use ExitPlanMode to present your plan for approval

Remember: DO NOT write or edit any files yet. This is a read-only exploration and planning phase.


# Fase 15 — Auto-Backup Mingguan (lokal)

## Context

Fase 13 sudah menyediakan backup **manual** (klik tombol di Database Manager).
Client sekarang minta lapisan tambahan: backup **otomatis** supaya tidak
bergantung pada kedisiplinan mengklik tombol. Sesuai keputusan yang sudah
diambil bersama user:

- Disimpan ke **folder lokal tetap** di laptop (`Documents/POS-Backup/`),
  belum ke cloud — Supabase belum ada sama sekali di project ini, itu scope terpisah.
- **Trigger**: dicek setiap kali app dibuka (bukan scheduler OS/Task Scheduler
  yang butuh app headless) — kalau sudah ≥7 hari sejak backup otomatis
  terakhir, jalankan backup di background, tanpa perlu user klik apapun.
- **Retensi**: simpan 4 file terbaru, backup otomatis yang lebih lama
  otomatis dihapus. (Backup manual dari Database Manager tidak disentuh oleh
  retensi ini — retensi hanya berlaku untuk file yang dibuat oleh mekanisme
  auto-backup, disimpan di folder & pola nama terpisah.)

Ini murni tambahan pada `db_manager.rs` yang sudah ada — reuse pola zip/backup
yang sudah teruji (fase 13), bukan bikin mekanisme backup baru dari nol.

## Desain

### Rust — `pos-app/src-tauri/src/db_manager.rs`

**Command baru** `run_auto_backup_if_due(app: AppHandle) -> Result<bool, String>`
- Baca `last-auto-backup.json` dari app **config** dir (folder yang sama tempat
  `db-manager-auth.json` fase 13 disimpan — bukan app data dir, supaya tidak
  ikut kebawa reset/restore yang hanya menyentuh `pos.db`).
  - Kalau file tidak ada, atau `last_backup_at` sudah ≥ 7 hari yang lalu → lanjut backup.
  - Kalau belum 7 hari → return `Ok(false)` (tidak ada yang terjadi), supaya
    frontend tahu tidak perlu tampilkan notifikasi apapun.
- Resolve folder tujuan: `dirs::document_dir()` + `"POS-Backup"` — `fs::create_dir_all` kalau belum ada.
- Nama file: `auto-backup-pos-YYYYMMDD-HHMMSS.zip` (prefix `auto-` membedakan
  dari backup manual `backup-pos-...zip` yang user buat sendiri dari Database
  Manager, supaya retensi 4-file tidak pernah menghapus backup manual milik user).
- Reuse logic compress yang sama persis dengan `backup_database()` (baca
  `pos.db`, tulis ke `zip::ZipWriter` dengan entry `pos.db`) — faktorkan jadi
  helper `fn write_db_zip(db_bytes: &[u8], dest: &Path) -> Result<(), String>`
  dipakai baik oleh `backup_database` maupun `run_auto_backup_if_due`, supaya
  tidak duplikasi kode compress.
- Setelah backup berhasil: tulis ulang `last-auto-backup.json` dengan timestamp sekarang.
- **Retensi**: list semua file `auto-backup-pos-*.zip` di folder tujuan, urutkan
  by filename (nama sudah mengandung timestamp jadi urutan string = urutan
  waktu), hapus yang paling lama sampai tersisa maksimal 4.
- Return `Ok(true)` kalau backup baru dibuat (supaya frontend bisa opsional
  kasih notifikasi singkat "Backup otomatis berhasil"), `Ok(false)` kalau belum waktunya.

**Tidak** perlu WAL checkpoint eksplisit lewat `getDb()` seperti backup manual
di fase 13 (itu dipanggil dari halaman Database Manager yang punya akses ke
`getDb()`). Command ini dipanggil dari `(app)/+layout.svelte` yang **sudah**
punya koneksi `getDb()` aktif (dipakai halaman kasir dkk) — jadi frontend
tetap yang menjalankan `PRAGMA wal_checkpoint(TRUNCATE);` sebelum invoke,
persis pola yang sudah ada, supaya konsisten & tidak perlu koneksi SQLite kedua di Rust.

### Frontend

**Ubah** `pos-app/src/routes/(app)/+layout.svelte` — di `onMount`, setelah user
dipastikan login, panggil (fire-and-forget, tidak blocking render):
```ts
import { runAutoBackupIfDue } from '$lib/db-manager';
import { getDb } from '$lib/db';

async function autoBackupCheck() {
	try {
		const db = await getDb();
		await db.execute('PRAGMA wal_checkpoint(TRUNCATE);');
		await runAutoBackupIfDue();
	} catch (e) {
		console.error('Auto-backup gagal:', e);
	}
}
```
Dipanggil sekali di `onMount`, tidak mengganggu UI kalau gagal (cukup log ke
console — bukan hal yang harus mem-block user kerja, sesuai sifat "housekeeping
otomatis"). Tidak ada UI progress/spinner untuk ini (background silent), beda
dengan backup manual di Database Manager yang punya UI eksplisit.

**Tambah** `pos-app/src/lib/db-manager/index.ts` — satu fungsi baru:
```ts
export function runAutoBackupIfDue(): Promise<boolean> {
	return invoke('run_auto_backup_if_due');
}
```

### Capability

Tidak perlu perubahan `capabilities/default.json` — command custom baru ini
tidak butuh permission plugin (sama seperti command fase 13 lainnya), dan
tidak pakai dialog/fs plugin dari sisi frontend (semua file I/O terjadi di Rust).

## File yang disentuh

- `pos-app/src-tauri/src/db_manager.rs` — command baru + helper zip yang di-refactor supaya reusable
- `pos-app/src/lib/db-manager/index.ts` — tambah `runAutoBackupIfDue()`
- `pos-app/src/routes/(app)/+layout.svelte` — panggil cek auto-backup di `onMount`

## Verifikasi

- `cargo check` + `npm run check` untuk memastikan build bersih (dijalankan
  oleh Claude, sesuai instruksi project — app sendiri tidak dijalankan oleh Claude).
- User test manual: buka app → cek folder `Documents/POS-Backup/` muncul file
  `auto-backup-pos-<timestamp>.zip` pertama kali. Untuk simulasi "7 hari
  berlalu" tanpa nunggu beneran, user bisa edit manual `last-auto-backup.json`
  di app config dir (`%APPDATA%\com.cj.pos-app\last-auto-backup.json`) mundur
  8 hari, lalu buka app lagi — harus muncul file backup baru & retensi
  memangkas jadi maksimal 4 kalau sudah lebih dari itu.
