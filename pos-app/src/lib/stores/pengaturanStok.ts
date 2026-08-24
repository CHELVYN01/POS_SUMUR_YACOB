import { writable, get } from 'svelte/store';
import { bacaStokLonggar, simpanStokLonggar } from '$lib/db/pengaturan';

/**
 * Mode stok, dibaca sekali saat aplikasi dibuka lalu dipakai Kasir & Produk.
 *
 * `true` (longgar) = stok 0 tetap boleh dijual dan stok opsional saat input —
 * perilaku sejak awal. `false` (ketat) = stok 0 tidak bisa dijual, tidak bisa
 * menjual melebihi stok, dan stok wajib diisi.
 *
 * Nilai awalnya sengaja longgar: kalau default-nya ketat, jeda sesaat antara
 * aplikasi dibuka dan pengaturan selesai dibaca akan menolak penjualan yang
 * sebenarnya sah.
 */
export const stokLonggar = writable(true);

export async function muatPengaturanStok(): Promise<void> {
	stokLonggar.set(await bacaStokLonggar());
}

export async function ubahStokLonggar(longgar: boolean): Promise<void> {
	await simpanStokLonggar(longgar);
	stokLonggar.set(longgar);
}

/** Untuk pemanggil non-reaktif (fungsi biasa di dalam komponen). */
export function stokKetat(): boolean {
	return !get(stokLonggar);
}
