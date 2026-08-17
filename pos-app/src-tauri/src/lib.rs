use tauri_plugin_sql::{Migration, MigrationKind};

mod db_manager;

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: include_str!("../migrations/0001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_kasbon_tables",
            sql: include_str!("../migrations/0002_kasbon.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "barang_delete_set_null",
            sql: include_str!("../migrations/0003_barang_delete_set_null.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    db_manager::apply_pending_db_swap_if_any();
    // Urutannya penting: swap dulu (file bisa berganti), baru periksa checksum file final.
    db_manager::repair_legacy_migration_checksums();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:pos.db", migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            db_manager::backup_database,
            db_manager::validate_zip_backup,
            db_manager::restore_database,
            db_manager::reset_database,
            db_manager::relaunch_app,
            db_manager::verify_master_password,
            db_manager::set_master_password,
            db_manager::take_pending_seed_admin,
            db_manager::run_auto_backup_if_due,
            db_manager::get_auto_backup_dir,
            db_manager::set_auto_backup_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
