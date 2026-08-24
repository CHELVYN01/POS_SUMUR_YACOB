//! Verifikasi lisensi. Spesifikasi formatnya: docs/lisensi.md
//!
//! Kembaran berkas ini ada di web-kios-pos/src/lib/server/lisensi/ (TypeScript,
//! sisi penerbit). Perubahan format harus dilakukan di dua tempat.
//!
//! Seluruh pemeriksaan berjalan **offline**: keaslian kode dibuktikan tanda tangan
//! Ed25519 terhadap public key yang ditanam di bawah, bukan dengan menghubungi server.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

/// Public key penerbit lisensi (Ed25519, 32 byte, hex).
/// Pasangannya ada di `LICENSE_PRIVATE_KEY` pada .env web-kios-pos.
/// Dibuat lewat `npm run lisensi:kunci`. JANGAN diganti setelah ada penjualan —
/// semua kode yang sudah terbit akan langsung tidak berlaku.
const PUBLIC_KEY_HEX: &str = "7f7d5bfb50753a4c421b3e601f5cb1283c751e9d9f83b54047d5f7c7a2628fa7";

const PENANDA: &str = "KIOS1";
const BERKAS_LISENSI: &str = "lisensi.json";
const BERKAS_MESIN: &str = "mesin.id";
/// Garam tetap supaya hash sidik jari tidak sama dengan hash ID mesin milik
/// aplikasi lain yang memakai sumber yang sama.
const GARAM_MESIN: &str = "kios-pos-v1";

/// Isi payload kode lisensi. Nama field pendek — lihat tabelnya di docs/lisensi.md.
#[derive(Debug, Deserialize)]
struct Payload {
    v: u8,
    t: String,
    d: u32,
    k: u32,
    s: String,
    n: String,
    i: String,
    x: Option<String>,
    /// ID Mesin yang dikunci ke kode ini, dalam bentuk yang tampil di layar
    /// (`A110-08AD-95CE-101B`) — bukan hash penuhnya, karena nilai inilah yang
    /// dibacakan pembeli ke halaman aktivasi. Kalau ada, wajib cocok: kode yang
    /// disalin ke komputer lain akan ditolak.
    #[serde(default)]
    m: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct BerkasLisensi {
    kode: String,
    mesin: String,
    #[serde(rename = "aktifSejak")]
    aktif_sejak: u64,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StatusLisensi {
    pub aktif: bool,
    /// Kenapa tidak aktif — ditampilkan apa adanya ke pengguna.
    pub alasan: Option<String>,
    pub tier: Option<String>,
    pub nama: Option<String>,
    /// 0 = tanpa batas.
    pub batas_perangkat: Option<u32>,
    pub perangkat_ke: Option<u32>,
    pub nomor_pesanan: Option<String>,
    pub terbit: Option<String>,
    pub kedaluwarsa: Option<String>,
    /// Selalu terisi, juga saat lisensi tidak aktif — pembeli perlu menyebutkannya
    /// ke penjual kalau kodenya harus diterbitkan ulang.
    pub id_mesin: String,
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

fn lisensi_path(dir: &Path) -> PathBuf {
    dir.join(BERKAS_LISENSI)
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Hari sejak 1970-01-01 untuk tanggal `YYYY-MM-DD`.
/// Dipakai hanya untuk membandingkan tanggal kedaluwarsa, jadi tidak perlu
/// menarik chrono cuma untuk ini.
fn hari_sejak_epoch(tanggal: &str) -> Option<i64> {
    let mut bagian = tanggal.split('-');
    let y: i64 = bagian.next()?.parse().ok()?;
    let m: i64 = bagian.next()?.parse().ok()?;
    let d: i64 = bagian.next()?.parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    // Algoritma days_from_civil (Howard Hinnant): tahun digeser supaya Maret jadi
    // bulan pertama, sehingga hari kabisat selalu jatuh di ujung siklus.
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146097 + doe - 719468)
}

fn sudah_lewat(tanggal: &str) -> bool {
    match hari_sejak_epoch(tanggal) {
        Some(hari) => (now_secs() / 86_400) as i64 > hari,
        // Tanggal yang tidak bisa dibaca tidak boleh diam-diam berarti "selamanya".
        None => true,
    }
}

fn hash_hex(nilai: &str) -> String {
    let mut h = Sha256::new();
    h.update(nilai.as_bytes());
    h.update(GARAM_MESIN.as_bytes());
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Sidik jari mesin (hash penuh). Sumbernya ID mesin bawaan OS: MachineGuid di
/// Windows, /etc/machine-id di Linux, IOPlatformUUID di macOS.
///
/// Kalau OS tidak memberi apa-apa (container, Linux tanpa machine-id), sebuah ID
/// acak dibuat sekali lalu disimpan di `mesin.id`. Aktivasi tetap jalan; yang hilang
/// hanya keterikatannya ke hardware.
fn sidik_jari(app: &AppHandle) -> Result<String, String> {
    if let Ok(id) = machine_uid::get() {
        let id = id.trim();
        if !id.is_empty() {
            return Ok(hash_hex(id));
        }
    }

    let dir = config_dir(app)?;
    let berkas = dir.join(BERKAS_MESIN);
    if let Ok(isi) = fs::read_to_string(&berkas) {
        let isi = isi.trim();
        if !isi.is_empty() {
            return Ok(hash_hex(isi));
        }
    }

    let acak = format!("{}-{}", now_secs(), std::process::id());
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(&berkas, &acak).map_err(|e| e.to_string())?;
    Ok(hash_hex(&acak))
}

/// Membuang pemisah dan menyeragamkan huruf, supaya `a110-08ad-95ce-101b`,
/// `A110 08AD 95CE 101B`, dan `A11008AD95CE101B` sama-sama diterima — ID ini
/// diketik ulang manusia, jadi variasi penulisannya wajar.
fn normalkan_id(nilai: &str) -> String {
    nilai
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_uppercase()
}

/// Bentuk sidik jari yang dibacakan ke penjual: `A1B2-C3D4-E5F6-7890`.
fn tampilkan_id_mesin(sidik: &str) -> String {
    sidik
        .chars()
        .take(16)
        .collect::<Vec<_>>()
        .chunks(4)
        .map(|c| c.iter().collect::<String>().to_uppercase())
        .collect::<Vec<_>>()
        .join("-")
}

fn public_key() -> Result<VerifyingKey, String> {
    let mut bytes = [0u8; 32];
    for (i, slot) in bytes.iter_mut().enumerate() {
        let hex = PUBLIC_KEY_HEX
            .get(i * 2..i * 2 + 2)
            .ok_or("Public key lisensi tidak lengkap")?;
        *slot = u8::from_str_radix(hex, 16).map_err(|_| "Public key lisensi bukan hex")?;
    }
    VerifyingKey::from_bytes(&bytes).map_err(|e| e.to_string())
}

/// Membaca kode dan memastikan tanda tangannya sah. Belum memeriksa mesin/kedaluwarsa.
fn bongkar_kode(kode: &str) -> Result<Payload, String> {
    let kode = bersihkan_kode(kode);
    let bagian: Vec<&str> = kode.split('.').collect();
    if bagian.len() != 3 || bagian[0] != PENANDA {
        return Err("Kode lisensi tidak dikenali. Pastikan seluruh kode tersalin utuh.".into());
    }

    let ttd_bytes = URL_SAFE_NO_PAD
        .decode(bagian[2])
        .map_err(|_| "Kode lisensi rusak atau terpotong.".to_string())?;
    let ttd_bytes: [u8; 64] = ttd_bytes
        .try_into()
        .map_err(|_| "Kode lisensi rusak atau terpotong.".to_string())?;

    // Yang ditandatangani adalah teks `KIOS1.<payload>` apa adanya — bukan hasil
    // parse JSON-nya. Jangan diubah jadi menandatangani payload hasil serialisasi
    // ulang: urutan key & escaping antara Node dan serde tidak dijamin sama.
    let tertandatangan = format!("{PENANDA}.{}", bagian[1]);
    public_key()?
        .verify_strict(tertandatangan.as_bytes(), &Signature::from_bytes(&ttd_bytes))
        .map_err(|_| "Kode lisensi tidak sah untuk aplikasi ini.".to_string())?;

    let payload_json = URL_SAFE_NO_PAD
        .decode(bagian[1])
        .map_err(|_| "Kode lisensi rusak atau terpotong.".to_string())?;
    let payload: Payload = serde_json::from_slice(&payload_json)
        .map_err(|_| "Isi kode lisensi tidak bisa dibaca.".to_string())?;

    if payload.v != 1 {
        return Err("Kode lisensi dibuat untuk versi aplikasi yang lebih baru.".into());
    }
    Ok(payload)
}

/// Kode disalin manusia dari layar, WhatsApp, atau berkas .lic — spasi, baris baru,
/// dan baris komentar `#` dari berkas itu wajar ikut terbawa.
fn bersihkan_kode(kode: &str) -> String {
    kode.lines()
        .filter(|b| !b.trim_start().starts_with('#'))
        .collect::<String>()
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect()
}

fn status_dari(payload: &Payload, id_mesin: String) -> StatusLisensi {
    StatusLisensi {
        aktif: true,
        alasan: None,
        tier: Some(payload.t.clone()),
        nama: Some(payload.n.clone()),
        batas_perangkat: Some(payload.d),
        perangkat_ke: Some(payload.k),
        nomor_pesanan: Some(payload.s.clone()),
        terbit: Some(payload.i.clone()),
        kedaluwarsa: payload.x.clone(),
        id_mesin,
    }
}

fn belum_aktif(alasan: &str, id_mesin: String) -> StatusLisensi {
    StatusLisensi {
        aktif: false,
        alasan: Some(alasan.to_string()),
        id_mesin,
        ..Default::default()
    }
}

/// Memeriksa kode terhadap mesin ini. Dipakai baik saat aktivasi maupun saat
/// pemeriksaan ulang tiap aplikasi dibuka.
fn periksa(kode: &str, sidik: &str) -> Result<Payload, String> {
    let payload = bongkar_kode(kode)?;

    if let Some(mesin) = &payload.m {
        if normalkan_id(mesin) != normalkan_id(&tampilkan_id_mesin(sidik)) {
            return Err(
                "Kode lisensi ini dikunci ke komputer lain. Minta kode untuk ID Mesin komputer ini."
                    .into(),
            );
        }
    }
    if let Some(x) = &payload.x {
        if sudah_lewat(x) {
            return Err(format!("Lisensi sudah berakhir pada {x}."));
        }
    }
    Ok(payload)
}

#[tauri::command]
pub fn id_mesin(app: AppHandle) -> Result<String, String> {
    Ok(tampilkan_id_mesin(&sidik_jari(&app)?))
}

/// Status lisensi saat ini. Tanda tangan diverifikasi **ulang setiap kali** dipanggil,
/// jadi mengedit `lisensi.json` dengan tangan (mis. menaikkan tier) tidak menghasilkan
/// apa-apa selain lisensi yang ditolak.
#[tauri::command]
pub fn status_lisensi(app: AppHandle) -> Result<StatusLisensi, String> {
    let sidik = sidik_jari(&app)?;
    let tampil = tampilkan_id_mesin(&sidik);

    let dir = config_dir(&app)?;
    let path = lisensi_path(&dir);
    if !path.exists() {
        return Ok(belum_aktif("Aplikasi belum diaktifkan.", tampil));
    }

    let raw = match fs::read_to_string(&path) {
        Ok(r) => r,
        Err(e) => return Ok(belum_aktif(&format!("Berkas lisensi tidak terbaca: {e}"), tampil)),
    };
    let berkas: BerkasLisensi = match serde_json::from_str(&raw) {
        Ok(b) => b,
        Err(_) => return Ok(belum_aktif("Berkas lisensi rusak. Masukkan ulang kodenya.", tampil)),
    };

    if berkas.mesin != sidik {
        return Ok(belum_aktif(
            "Lisensi ini terdaftar untuk komputer lain. Kalau sistem operasi baru dipasang ulang, minta kode pengganti dengan menyebutkan ID Mesin di atas.",
            tampil,
        ));
    }

    match periksa(&berkas.kode, &sidik) {
        Ok(payload) => Ok(status_dari(&payload, tampil)),
        Err(alasan) => Ok(belum_aktif(&alasan, tampil)),
    }
}

/// Mengaktifkan kode. Gagal mengembalikan `Err` supaya pesannya tampil sebagai
/// error di kolom masukan, bukan sebagai status tersimpan.
#[tauri::command]
pub fn aktivasi_lisensi(app: AppHandle, kode: String) -> Result<StatusLisensi, String> {
    let sidik = sidik_jari(&app)?;
    let payload = periksa(&kode, &sidik)?;

    let dir = config_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let berkas = BerkasLisensi {
        kode: bersihkan_kode(&kode),
        mesin: sidik.clone(),
        aktif_sejak: now_secs(),
    };
    let json = serde_json::to_string_pretty(&berkas).map_err(|e| e.to_string())?;
    fs::write(lisensi_path(&dir), json).map_err(|e| e.to_string())?;

    Ok(status_dari(&payload, tampilkan_id_mesin(&sidik)))
}

/// Melepas lisensi dari komputer ini — untuk pindah mesin. Dikunci master password
/// Database Manager, bukan login kasir: mencabut lisensi mengunci seluruh aplikasi.
///
/// Perlu diingat: melepas di sini tidak "mengembalikan" kuota ke mana pun, karena
/// tidak ada server yang menghitung. Gunanya murni supaya mesin ini berhenti memakai
/// kode tersebut.
#[tauri::command]
pub fn hapus_lisensi(app: AppHandle, master_password: String) -> Result<(), String> {
    if !crate::db_manager::verify_master_password(app.clone(), master_password)? {
        return Err("Master password salah.".into());
    }
    let dir = config_dir(&app)?;
    let path = lisensi_path(&dir);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Kode contoh dari `npm run lisensi -- --tier pro --nama "Toko Budi"`,
    /// ditandatangani kunci pengembangan yang sama dengan PUBLIC_KEY_HEX di atas.
    /// Kalau pasangan kunci diganti, kode ini harus ikut diganti.
    const KODE_UJI: &str = "KIOS1.eyJ2IjoxLCJ0IjoicHJvIiwiZCI6MywiayI6MSwicyI6IktQLTIwMjYwODIzLTdFRjVBOUYwIiwibiI6IlRva28gQnVkaSIsImkiOiIyMDI2LTA4LTIzIiwieCI6bnVsbH0.AF76z528tWGRboP4PJaPb08SL_wGt3fdYZ5wCq2vgl-AH3n131q7Ly_7E25iHC3pq3r5qlHIOPDFUK8G1ZF1BA";

    #[test]
    fn menerima_kode_terbitan_website() {
        let p = bongkar_kode(KODE_UJI).expect("kode contoh harus lolos verifikasi");
        assert_eq!(p.t, "pro");
        assert_eq!(p.d, 3);
        assert_eq!(p.k, 1);
        assert_eq!(p.n, "Toko Budi");
        assert!(p.x.is_none());
    }

    #[test]
    fn menerima_kode_dengan_spasi_dan_komentar_berkas_lic() {
        let kotor = format!("# Lisensi Kios POS\n# Perangkat 1\n{}\n", KODE_UJI);
        assert!(bongkar_kode(&kotor).is_ok());
    }

    #[test]
    fn menolak_payload_yang_diubah() {
        // Naikkan tier basic→bisnis lewat payload: tanda tangannya tidak ikut berubah.
        let bagian: Vec<&str> = KODE_UJI.split('.').collect();
        let asli = URL_SAFE_NO_PAD.decode(bagian[1]).unwrap();
        let diubah = String::from_utf8(asli).unwrap().replace("\"pro\"", "\"bisnis\"");
        let palsu = format!(
            "{PENANDA}.{}.{}",
            URL_SAFE_NO_PAD.encode(diubah.as_bytes()),
            bagian[2]
        );
        assert!(bongkar_kode(&palsu).is_err());
    }

    #[test]
    fn menolak_kode_asal() {
        assert!(bongkar_kode("KIOS1.abc.def").is_err());
        assert!(bongkar_kode("bukan kode").is_err());
        assert!(bongkar_kode("").is_err());
    }

    #[test]
    fn kode_tanpa_ikatan_mesin_jalan_di_mana_saja() {
        let p = bongkar_kode(KODE_UJI).unwrap();
        assert!(p.m.is_none(), "kode contoh sengaja tanpa ikatan mesin");
        assert!(periksa(KODE_UJI, &hash_hex("mesin-a")).is_ok());
        assert!(periksa(KODE_UJI, &hash_hex("mesin-b")).is_ok());
    }

    /// Kode yang dikunci ke mesin, diterbitkan untuk `hash_hex("mesin-a")`
    /// (= A516-E451-AE9D-3B23) lewat `npm run lisensi -- --mesin ...`.
    const KODE_TERIKAT: &str = "KIOS1.eyJ2IjoxLCJ0IjoicHJvIiwiZCI6MywiayI6MSwicyI6IktQLVVKSS1NRVNJTiIsIm4iOiJUb2tvIEJ1ZGkiLCJpIjoiMjAyNi0wOC0yNCIsIngiOm51bGwsIm0iOiJBNTE2LUU0NTEtQUU5RC0zQjIzIn0.I8FScIf97hmuF8jVtfI1eRBHVr4ZvY6sKATjbRVBzZZa0nsqwu_H69zyx3hqSd9Pdh5bOlyy8XX06Lj7MyCGCQ";

    #[test]
    fn kode_terikat_hanya_jalan_di_mesinnya() {
        // Inti seluruh fase ini: menyalin kode ke komputer lain harus percuma.
        assert!(periksa(KODE_TERIKAT, &hash_hex("mesin-a")).is_ok());

        let ditolak = periksa(KODE_TERIKAT, &hash_hex("mesin-b")).unwrap_err();
        assert!(ditolak.contains("dikunci ke komputer lain"), "pesan: {ditolak}");
    }

    #[test]
    fn kode_terikat_membawa_id_mesinnya() {
        let p = bongkar_kode(KODE_TERIKAT).unwrap();
        assert_eq!(p.m.as_deref(), Some("A516-E451-AE9D-3B23"));
        assert_eq!(p.m.as_deref().unwrap(), tampilkan_id_mesin(&hash_hex("mesin-a")));
    }

    #[test]
    fn id_mesin_dicocokkan_apa_pun_cara_menulisnya() {
        let sidik = hash_hex("mesin-a");
        let tampil = tampilkan_id_mesin(&sidik);
        assert_eq!(normalkan_id(&tampil), normalkan_id(&tampil.to_lowercase()));
        assert_eq!(normalkan_id(&tampil), normalkan_id(&tampil.replace('-', " ")));
        assert_eq!(normalkan_id(&tampil), normalkan_id(&tampil.replace('-', "")));
        // Mesin lain tetap beda.
        assert_ne!(
            normalkan_id(&tampil),
            normalkan_id(&tampilkan_id_mesin(&hash_hex("mesin-b")))
        );
    }

    #[test]
    fn tanggal_kedaluwarsa_dibandingkan_benar() {
        assert_eq!(hari_sejak_epoch("1970-01-01"), Some(0));
        assert_eq!(hari_sejak_epoch("2000-03-01"), Some(11017));
        assert_eq!(hari_sejak_epoch("2026-08-23"), Some(20688));
        assert!(sudah_lewat("2020-01-01"));
        assert!(!sudah_lewat("2999-01-01"));
        // Tanggal ngawur tidak boleh dianggap "berlaku selamanya".
        assert!(sudah_lewat("bukan-tanggal"));
    }

    #[test]
    fn id_mesin_dibaca_berkelompok() {
        assert_eq!(tampilkan_id_mesin(&hash_hex("mesin-a"))[4..5], *"-");
        assert_eq!(tampilkan_id_mesin(&hash_hex("mesin-a")).len(), 19);
        assert_ne!(hash_hex("mesin-a"), hash_hex("mesin-b"));
    }
}
