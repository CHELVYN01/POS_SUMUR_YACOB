import { writable } from 'svelte/store';
import { bacaLaporanKasirHariIni, simpanLaporanKasirHariIni } from '$lib/db/pengaturan';

/**
 * Hak akses Laporan, dibaca sekali saat aplikasi dibuka lalu dipakai halaman Laporan.
 *
 * `true` = user non-admin hanya boleh melihat laporan hari ini. Admin selalu
 * melihat semuanya, jadi nilai ini tidak berlaku untuk mereka.
 *
 * Nilai awalnya sengaja `false`: kalau default-nya membatasi, jeda sesaat antara
 * aplikasi dibuka dan pengaturan selesai dibaca akan membuat tab laporan berkedip
 * hilang lalu muncul lagi untuk admin maupun kasir.
 */
export const laporanKasirHariIni = writable(false);

export async function muatPengaturanLaporan(): Promise<void> {
	laporanKasirHariIni.set(await bacaLaporanKasirHariIni());
}

export async function ubahLaporanKasirHariIni(batasi: boolean): Promise<void> {
	await simpanLaporanKasirHariIni(batasi);
	laporanKasirHariIni.set(batasi);
}
