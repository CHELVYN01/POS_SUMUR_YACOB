import { writable } from 'svelte/store';
import { statusLisensi, type StatusLisensi } from '$lib/lisensi';

/**
 * Status lisensi terakhir yang dibaca dari Rust. Diisi sekali saat aplikasi dibuka
 * (root +layout) dan disegarkan setelah aktivasi atau pelepasan lisensi.
 *
 * `null` berarti belum pernah diperiksa — bukan berarti tidak aktif. Penjaga
 * halaman harus menunggu nilai pertamanya, kalau tidak layar aktivasi akan
 * berkedip sekejap tiap kali aplikasi dibuka.
 */
export const lisensi = writable<StatusLisensi | null>(null);

export async function segarkanLisensi(): Promise<StatusLisensi> {
	const status = await statusLisensi();
	lisensi.set(status);
	return status;
}
