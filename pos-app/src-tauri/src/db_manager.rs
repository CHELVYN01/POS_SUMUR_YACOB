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

fn app_data_dir_manual() -> PathBuf {
    dirs::config_dir()
        .expect("tidak bisa menemukan config dir OS")
        .join(APP_IDENTIFIER)
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
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

/// Reads (and consumes) the pending post-reset admin payload, if any. Called from the frontend
/// after `getDb()` has resolved, which guarantees tauri-plugin-sql has already finished running
/// migrations on `pos.db` — running this from a Rust `.setup()` hook is NOT safe, because
/// tauri-plugin-sql only migrates lazily on the first `Database.load()` call from JS, not on
/// plugin mount.
#[tauri::command]
pub fn take_pending_seed_admin(app: AppHandle) -> Result<Option<SeedAdmin>, String> {
    let dir = app_data_dir(&app)?;
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
    let dir = app_data_dir(&app)?;
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

    let dir = app_data_dir(&app)?;
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
    let dir = app_data_dir(&app)?;
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

    let dir = app_data_dir(&app)?;
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
