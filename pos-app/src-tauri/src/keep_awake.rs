//! Menjaga layar tetap menyala selama aplikasi POS berjalan (fase 19).
//!
//! App ini dipasang di mesin kasir Windows **dan** Linux Mint, dan dikembangkan
//! di macOS — ketiganya punya mekanisme yang sama sekali berbeda:
//!
//! - Windows: `SetThreadExecutionState`
//! - Linux: D-Bus `org.freedesktop.ScreenSaver.Inhibit` (dipatuhi cinnamon-screensaver)
//!   plus inhibitor lock logind untuk idle
//! - macOS: IOKit power assertion
//!
//! Yang Linux tidak bisa ditulis tangan tanpa klien D-Bus, dan penahannya baru
//! berlaku selama koneksi D-Bus-nya hidup (cookie hasil Inhibit lepas begitu
//! koneksi tutup) — jadi dipakai crate `keepawake` yang sudah menangani ketiganya
//! sekaligus melepas penahan dengan benar saat di-drop.
//!
//! `sleep` sengaja TIDAK diaktifkan: yang diminta adalah layar tidak mati sendiri,
//! bukan melarang orang menidurkan komputernya dengan sengaja.

/// Penahan layar. Berlaku selama nilai ini masih hidup, lepas saat di-drop.
pub type Penahan = keepawake::KeepAwake;

/// Mulai menjaga layar tetap menyala.
///
/// Nilai kembaliannya WAJIB disimpan selama aplikasi berjalan — begitu di-drop,
/// layar boleh mati lagi. Di Windows penahannya juga terikat ke thread pemanggil,
/// jadi panggil dari main thread (bukan dari handler Tauri command yang jalan di
/// thread pool tokio dan bisa berganti thread).
///
/// Mengembalikan `None` kalau gagal — layar boleh mati, tapi aplikasi tetap jalan.
pub fn start() -> Option<Penahan> {
    let hasil = keepawake::Builder::default()
        .display(true) // layar jangan mati / screensaver jangan jalan
        .idle(true) // komputer jangan sleep karena dianggap nganggur
        .reason("Kasir harus tetap terlihat selama aplikasi POS dibuka")
        .app_name("POS Sumur Yacob")
        .app_reverse_domain("com.sumuryacob.pos")
        .create();

    match hasil {
        Ok(penahan) => Some(penahan),
        Err(e) => {
            // Bukan alasan untuk membatalkan start-up: kasir masih bisa jualan,
            // layarnya saja yang bisa mati sendiri seperti sebelum fase 19.
            eprintln!("[keep-awake] gagal menahan layar tetap menyala: {e}");
            None
        }
    }
}
