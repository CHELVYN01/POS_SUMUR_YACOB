use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const APP_IDENTIFIER: &str = "com.cj.pos-app";
const DB_FILE_NAME: &str = "pos.db";
const SQLITE_MAGIC: &[u8; 16] = b"SQLite format 3\0";
// Used only until an admin sets a real master password via db-manager-auth.json.
const DEFAULT_MASTER_PASSWORD: &str = "admin123";

#[derive(Serialize, Deserialize)]
struct MasterAuth {
    password_hash: String,
    updated_at: String,
}

#[derive(Serialize, Deserialize, Default)]
struct AutoBackupState {
    last_backup_at: Option<u64>,
    custom_dir: Option<String>,
}

const AUTO_BACKUP_INTERVAL_SECS: u64 = 7 * 24 * 60 * 60;
const AUTO_BACKUP_RETAIN: usize = 4;
const AUTO_BACKUP_PREFIX: &str = "auto-backup-pos-";

#[derive(Serialize, Deserialize, Clone)]
pub struct SeedAdmin {
    nama: String,
    username: String,
    password: String,
}

/// Folder tempat `pos.db` berada, dihitung tanpa `AppHandle` (dipakai sebelum
/// Tauri dibangun). Harus menghasilkan path yang sama dengan [`db_dir`].
fn app_data_dir_manual() -> PathBuf {
    dirs::config_dir()
        .expect("tidak bisa menemukan config dir OS")
        .join(APP_IDENTIFIER)
}

/// Folder database. **Wajib** `app_config_dir()`, bukan `app_data_dir()`:
/// `tauri-plugin-sql` menerjemahkan `"sqlite:pos.db"` relatif terhadap
/// app_config_dir, jadi di situlah file DB yang sebenarnya dipakai berada.
///
/// Di Windows & macOS keduanya kebetulan menunjuk folder yang sama, jadi
/// memakai `app_data_dir()` tidak pernah kelihatan salah. Di Linux beda:
/// config = `~/.config/<id>`, data = `~/.local/share/<id>` — Backup/Restore/
/// Reset akan menyentuh folder kosong dan database aslinya tidak tersentuh.
fn db_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app_config_dir(app)
}

fn app_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

fn db_path(dir: &Path) -> PathBuf {
    dir.join(DB_FILE_NAME)
}

fn wal_path(dir: &Path) -> PathBuf {
    dir.join(format!("{DB_FILE_NAME}-wal"))
}

fn shm_path(dir: &Path) -> PathBuf {
    dir.join(format!("{DB_FILE_NAME}-shm"))
}

fn pending_path(dir: &Path) -> PathBuf {
    dir.join("pos.db.pending")
}

fn seed_pending_path(dir: &Path) -> PathBuf {
    dir.join("pos.db.seed-pending.json")
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn timestamp() -> String {
    now_secs().to_string()
}

/// Must run before the sql plugin is mounted (no live SQLite connection yet at this point in
/// `run()`), so a restore/reset can safely replace the file without hitting Windows file locks.
pub fn apply_pending_db_swap_if_any() {
    let dir = app_data_dir_manual();
    if !dir.exists() {
        return;
    }

    let db = db_path(&dir);

    let pending = pending_path(&dir);
    if pending.exists() {
        if db.exists() {
            let _ = fs::copy(&db, dir.join("pos.db.bak"));
        }
        let _ = fs::remove_file(wal_path(&dir));
        let _ = fs::remove_file(shm_path(&dir));
        let _ = fs::rename(&pending, &db);
        return;
    }

    // reset_database() could only back up + mark for deletion while the app was still
    // holding the old pos.db open; the actual delete happens here, before sql plugin mounts.
    if seed_pending_path(&dir).exists() && db.exists() {
        let _ = fs::remove_file(wal_path(&dir));
        let _ = fs::remove_file(shm_path(&dir));
        let _ = fs::remove_file(&db);
    }
}

/// SQL migration files are supposed to be immutable once shipped: sqlx stores a SHA-384 of each
/// file in `_sqlx_migrations` and refuses to open the database when the file no longer hashes to
/// the recorded value. `0001_initial.sql` was edited after release anyway (Fase 13 moved the seed
/// INSERTs to the frontend), so every database created before that release now aborts on the very
/// first `Database.load()` — which in this app is the login screen, making the app unusable.
///
/// The edit only removed INSERT statements; the CREATE TABLE / CREATE INDEX part is byte-identical,
/// so those old databases already have exactly the schema the current file produces. Re-stamping
/// the recorded checksum is therefore safe, and no user data is read or written.
///
/// Each entry is a checksum that is *known* to correspond to an obsolete revision of that
/// migration — never a blanket "any mismatch is fine", which would silently paper over a real
/// schema divergence. Both LF and CRLF hashes are listed because the checksum covers raw file
/// bytes, and a Windows checkout may have normalised the line endings.
const LEGACY_MIGRATION_CHECKSUMS: &[(i64, &str, &str)] = &[
    // 0001_initial.sql sebelum Fase 13 (masih memuat seed user + 8 barang contoh), LF.
    (
        1,
        "58d66c61789dd421725d8e0b88d5176cb7e0520f2f12931ed1da9084f1c7bb8e2a5c060c8129ef920dddf725a144f400",
        include_str!("../migrations/0001_initial.sql"),
    ),
    // Isi yang sama, tapi di-checkout dengan CRLF (build Windows).
    (
        1,
        "9e00028f194d324aaaa10d08afae277625590eb773e78b0bfad8d117c7a61e66466d50fbe8ac459bfb09865a303d711b",
        include_str!("../migrations/0001_initial.sql"),
    ),
];

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Must run before the sql plugin is mounted, for the same reason as
/// [`apply_pending_db_swap_if_any`]: no live SQLite connection may exist yet. Failures are
/// deliberately swallowed — if the repair cannot run, the app should still start and surface
/// tauri-plugin-sql's own error rather than die here.
pub fn repair_legacy_migration_checksums() {
    let db = db_path(&app_data_dir_manual());
    if !db.exists() {
        return;
    }
    if let Err(e) = tauri::async_runtime::block_on(repair_checksums(&db)) {
        eprintln!("[db] perbaikan checksum migration dilewati: {e}");
    }
}

async fn repair_checksums(db: &Path) -> Result<(), String> {
    use sha2::{Digest, Sha384};
    use sqlx::sqlite::SqliteConnectOptions;
    use sqlx::{Connection, Row, SqliteConnection};

    let opts = SqliteConnectOptions::new()
        .filename(db)
        .create_if_missing(false);
    let mut conn = SqliteConnection::connect_with(&opts)
        .await
        .map_err(|e| e.to_string())?;

    let has_table = sqlx::query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'")
        .fetch_optional(&mut conn)
        .await
        .map_err(|e| e.to_string())?
        .is_some();
    if !has_table {
        // Fresh database — tauri-plugin-sql will create the table and apply everything itself.
        return conn.close().await.map_err(|e| e.to_string());
    }

    for (version, legacy_hex, current_sql) in LEGACY_MIGRATION_CHECKSUMS {
        let row = sqlx::query("SELECT checksum FROM _sqlx_migrations WHERE version = ?")
            .bind(version)
            .fetch_optional(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
        let Some(row) = row else { continue };
        let stored: Vec<u8> = row.try_get("checksum").map_err(|e| e.to_string())?;
        if to_hex(&stored) != *legacy_hex {
            continue;
        }

        let current = Sha384::digest(current_sql.as_bytes()).to_vec();
        if current == stored {
            continue;
        }
        sqlx::query("UPDATE _sqlx_migrations SET checksum = ? WHERE version = ?")
            .bind(current)
            .bind(version)
            .execute(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
        eprintln!("[db] checksum migration {version} lama di-stamp ulang ke isi file sekarang");
    }

    conn.close().await.map_err(|e| e.to_string())
}

/// Reads (and consumes) the pending post-reset admin payload, if any. Called from the frontend
/// after `getDb()` has resolved, which guarantees tauri-plugin-sql has already finished running
/// migrations on `pos.db` — running this from a Rust `.setup()` hook is NOT safe, because
/// tauri-plugin-sql only migrates lazily on the first `Database.load()` call from JS, not on
/// plugin mount.
#[tauri::command]
pub fn take_pending_seed_admin(app: AppHandle) -> Result<Option<SeedAdmin>, String> {
    let dir = db_dir(&app)?;
    let seed_pending = seed_pending_path(&dir);
    if !seed_pending.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&seed_pending).map_err(|e| e.to_string())?;
    let admin: SeedAdmin = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&seed_pending);
    Ok(Some(admin))
}

fn write_db_zip(db_bytes: &[u8], dest: &Path) -> Result<(), String> {
    let file = fs::File::create(dest).map_err(|e| format!("Gagal membuat file zip: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    zip.start_file(DB_FILE_NAME, options)
        .map_err(|e| e.to_string())?;
    zip.write_all(db_bytes).map_err(|e| e.to_string())?;
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn backup_database(app: AppHandle, dest_path: String) -> Result<(), String> {
    let dir = db_dir(&app)?;
    let db = db_path(&dir);
    let bytes = fs::read(&db).map_err(|e| format!("Gagal membaca database: {e}"))?;
    write_db_zip(&bytes, Path::new(&dest_path))
}

fn default_auto_backup_dir() -> Result<PathBuf, String> {
    let base = dirs::document_dir().ok_or("Tidak bisa menemukan folder Documents")?;
    Ok(base.join("POS-Backup"))
}

fn auto_backup_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join("last-auto-backup.json"))
}

fn read_auto_backup_state(app: &AppHandle) -> Result<AutoBackupState, String> {
    let path = auto_backup_state_path(app)?;
    match fs::read_to_string(&path) {
        Ok(raw) => Ok(serde_json::from_str(&raw).unwrap_or_default()),
        Err(_) => Ok(AutoBackupState::default()),
    }
}

fn write_auto_backup_state(app: &AppHandle, state: &AutoBackupState) -> Result<(), String> {
    let path = auto_backup_state_path(app)?;
    fs::create_dir_all(app_config_dir(app)?).map_err(|e| e.to_string())?;
    let json = serde_json::to_string(state).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

/// Resolves where auto-backups should be written: the user's chosen folder if it's still
/// set and accessible, otherwise Documents/POS-Backup — auto-backup must never simply stop
/// working just because a chosen drive (e.g. a flash disk) became unavailable.
fn resolve_auto_backup_dir(state: &AutoBackupState) -> Result<PathBuf, String> {
    if let Some(custom) = &state.custom_dir {
        let path = PathBuf::from(custom);
        if path.is_dir() {
            return Ok(path);
        }
    }
    default_auto_backup_dir()
}

#[tauri::command]
pub fn get_auto_backup_dir(app: AppHandle) -> Result<String, String> {
    let state = read_auto_backup_state(&app)?;
    let dir = resolve_auto_backup_dir(&state)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn set_auto_backup_dir(app: AppHandle, dir: String) -> Result<(), String> {
    if !Path::new(&dir).is_dir() {
        return Err("Folder tidak ditemukan".to_string());
    }
    let mut state = read_auto_backup_state(&app)?;
    state.custom_dir = Some(dir);
    write_auto_backup_state(&app, &state)
}

fn prune_old_auto_backups(dir: &Path) -> Result<(), String> {
    let mut files: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with(AUTO_BACKUP_PREFIX) && n.ends_with(".zip"))
                .unwrap_or(false)
        })
        .collect();

    // Epoch-seconds are embedded in the filename, so lexicographic order = chronological order.
    files.sort();

    if files.len() > AUTO_BACKUP_RETAIN {
        let to_remove = files.len() - AUTO_BACKUP_RETAIN;
        for old in &files[..to_remove] {
            let _ = fs::remove_file(old);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn run_auto_backup_if_due(app: AppHandle) -> Result<bool, String> {
    let mut state = read_auto_backup_state(&app)?;
    let now = now_secs();

    if let Some(last) = state.last_backup_at {
        if now.saturating_sub(last) < AUTO_BACKUP_INTERVAL_SECS {
            return Ok(false);
        }
    }

    let dir = db_dir(&app)?;
    let db = db_path(&dir);
    let bytes = fs::read(&db).map_err(|e| format!("Gagal membaca database: {e}"))?;

    let backup_dir = resolve_auto_backup_dir(&state)?;
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    let dest = backup_dir.join(format!("{AUTO_BACKUP_PREFIX}{now}.zip"));
    write_db_zip(&bytes, &dest)?;

    prune_old_auto_backups(&backup_dir)?;

    state.last_backup_at = Some(now);
    write_auto_backup_state(&app, &state)?;

    Ok(true)
}

fn read_and_validate_zip(zip_path: &str) -> Result<Vec<u8>, String> {
    let file = fs::File::open(zip_path).map_err(|_| "File tidak bisa dibuka".to_string())?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|_| "Zip tidak valid atau rusak".to_string())?;
    let mut entry = archive
        .by_name(DB_FILE_NAME)
        .map_err(|_| "Backup tidak berisi pos.db".to_string())?;

    let mut buf = Vec::new();
    entry
        .read_to_end(&mut buf)
        .map_err(|e| format!("Gagal membaca isi zip: {e}"))?;

    if buf.len() < 16 || &buf[0..16] != SQLITE_MAGIC {
        return Err("File database di dalam backup tidak valid".to_string());
    }

    Ok(buf)
}

#[tauri::command]
pub fn validate_zip_backup(zip_path: String) -> Result<(), String> {
    read_and_validate_zip(&zip_path).map(|_| ())
}

#[tauri::command]
pub fn restore_database(app: AppHandle, zip_path: String) -> Result<(), String> {
    let buf = read_and_validate_zip(&zip_path)?;
    let dir = db_dir(&app)?;
    fs::write(pending_path(&dir), &buf).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reset_database(
    app: AppHandle,
    admin_nama: String,
    admin_username: String,
    admin_password: String,
) -> Result<(), String> {
    if admin_nama.trim().is_empty() || admin_username.trim().is_empty() || admin_password.is_empty() {
        return Err("Data admin baru wajib diisi".to_string());
    }

    let dir = db_dir(&app)?;
    let db = db_path(&dir);

    if db.exists() {
        fs::copy(&db, dir.join(format!("pos.db.bak-{}", timestamp())))
            .map_err(|e| format!("Gagal membuat backup pengaman: {e}"))?;
    }

    // pos.db is still open by the live sql plugin connection — don't delete it here (Windows
    // will refuse with a sharing violation). Just leave a marker; the actual delete happens in
    // apply_pending_db_swap_if_any() on the next launch, before any connection is opened.
    let seed = SeedAdmin {
        nama: admin_nama,
        username: admin_username,
        password: admin_password,
    };
    let json = serde_json::to_string(&seed).map_err(|e| e.to_string())?;
    fs::write(seed_pending_path(&dir), json).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn relaunch_app(app: AppHandle) {
    app.restart();
}

fn load_master_hash(app: &AppHandle) -> Result<Option<String>, String> {
    let dir = app_config_dir(app)?;
    let auth_path = dir.join("db-manager-auth.json");
    if !auth_path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&auth_path).map_err(|e| e.to_string())?;
    let auth: MasterAuth = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok(Some(auth.password_hash))
}

fn verify_password(password: &str, hash: &str) -> bool {
    let parsed = match PasswordHash::new(hash) {
        Ok(p) => p,
        Err(_) => return false,
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

fn verify_against_stored_or_default(password: &str, stored: &Option<String>) -> bool {
    match stored {
        Some(hash) => verify_password(password, hash),
        None => password == DEFAULT_MASTER_PASSWORD,
    }
}

#[tauri::command]
pub fn verify_master_password(app: AppHandle, password: String) -> Result<bool, String> {
    let hash = load_master_hash(&app)?;
    Ok(verify_against_stored_or_default(&password, &hash))
}

#[tauri::command]
pub fn set_master_password(
    app: AppHandle,
    old_password: String,
    new_password: String,
) -> Result<(), String> {
    let current_hash = load_master_hash(&app)?;
    if !verify_against_stored_or_default(&old_password, &current_hash) {
        return Err("Password lama salah".to_string());
    }
    if new_password.trim().is_empty() {
        return Err("Password baru tidak boleh kosong".to_string());
    }

    let salt = SaltString::generate(&mut OsRng);
    let new_hash = Argon2::default()
        .hash_password(new_password.as_bytes(), &salt)
        .map_err(|e| e.to_string())?
        .to_string();

    let dir = app_config_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let auth = MasterAuth {
        password_hash: new_hash,
        updated_at: timestamp(),
    };
    let json = serde_json::to_string_pretty(&auth).map_err(|e| e.to_string())?;
    fs::write(dir.join("db-manager-auth.json"), json).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha384};
    use sqlx::sqlite::SqliteConnectOptions;
    use sqlx::{Connection, Row, SqliteConnection};

    /// Builds a database that looks exactly like one created before Fase 13: the schema the
    /// current 0001 produces, but with the *old* checksum recorded — the state that makes
    /// tauri-plugin-sql abort at login.
    async fn make_stale_db(path: &Path, recorded: &str) {
        let opts = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true);
        let mut conn = SqliteConnection::connect_with(&opts).await.unwrap();
        sqlx::query(
            "CREATE TABLE _sqlx_migrations (
                version BIGINT PRIMARY KEY,
                description TEXT NOT NULL,
                installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN NOT NULL,
                checksum BLOB NOT NULL,
                execution_time BIGINT NOT NULL
            )",
        )
        .execute(&mut conn)
        .await
        .unwrap();
        let bytes: Vec<u8> = (0..recorded.len() / 2)
            .map(|i| u8::from_str_radix(&recorded[i * 2..i * 2 + 2], 16).unwrap())
            .collect();
        sqlx::query(
            "INSERT INTO _sqlx_migrations
             (version, description, success, checksum, execution_time)
             VALUES (1, 'create_initial_tables', 1, ?, 0)",
        )
        .bind(bytes)
        .execute(&mut conn)
        .await
        .unwrap();
        conn.close().await.unwrap();
    }

    async fn stored_checksum(path: &Path) -> Vec<u8> {
        let opts = SqliteConnectOptions::new().filename(path);
        let mut conn = SqliteConnection::connect_with(&opts).await.unwrap();
        let row = sqlx::query("SELECT checksum FROM _sqlx_migrations WHERE version = 1")
            .fetch_one(&mut conn)
            .await
            .unwrap();
        let out: Vec<u8> = row.try_get("checksum").unwrap();
        conn.close().await.unwrap();
        out
    }

    fn current_0001() -> Vec<u8> {
        Sha384::digest(include_str!("../migrations/0001_initial.sql").as_bytes()).to_vec()
    }

    #[tokio::test]
    async fn restamps_known_legacy_checksum() {
        for legacy in [
            "58d66c61789dd421725d8e0b88d5176cb7e0520f2f12931ed1da9084f1c7bb8e2a5c060c8129ef920dddf725a144f400",
            "9e00028f194d324aaaa10d08afae277625590eb773e78b0bfad8d117c7a61e66466d50fbe8ac459bfb09865a303d711b",
        ] {
            let dir = std::env::temp_dir().join(format!("pos-test-{legacy:.8}"));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            let db = dir.join("pos.db");

            make_stale_db(&db, legacy).await;
            repair_checksums(&db).await.unwrap();

            assert_eq!(stored_checksum(&db).await, current_0001());
            let _ = fs::remove_dir_all(&dir);
        }
    }

    /// An unrecognised checksum must be left alone: it could mean a genuine schema divergence,
    /// and silently stamping over it would hide a real problem.
    #[tokio::test]
    async fn leaves_unknown_checksum_untouched() {
        let dir = std::env::temp_dir().join("pos-test-unknown");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let db = dir.join("pos.db");

        let unknown = "aa".repeat(48);
        make_stale_db(&db, &unknown).await;
        repair_checksums(&db).await.unwrap();

        assert_eq!(stored_checksum(&db).await, vec![0xaa; 48]);
        let _ = fs::remove_dir_all(&dir);
    }

    /// Already-healthy databases (and re-runs of the repair) must be no-ops.
    #[tokio::test]
    async fn idempotent_on_healthy_db() {
        let dir = std::env::temp_dir().join("pos-test-healthy");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let db = dir.join("pos.db");

        make_stale_db(&db, &to_hex(&current_0001())).await;
        repair_checksums(&db).await.unwrap();
        repair_checksums(&db).await.unwrap();

        assert_eq!(stored_checksum(&db).await, current_0001());
        let _ = fs::remove_dir_all(&dir);
    }
}
