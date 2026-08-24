import { invoke } from '@tauri-apps/api/core';

/**
 * Jembatan ke pemeriksa lisensi di Rust (src-tauri/src/lisensi.rs).
 * Semua keputusan sah/tidaknya lisensi diambil di sisi Rust — frontend hanya
 * menampilkan hasilnya. Jangan pernah menyimpulkan "aktif" dari sini sendiri.
 */

export interface StatusLisensi {
	aktif: boolean;
	alasan: string | null;
	tier: string | null;
	nama: string | null;
	/** 0 = tanpa batas. */
	batasPerangkat: number | null;
	perangkatKe: number | null;
	nomorPesanan: string | null;
	terbit: string | null;
	kedaluwarsa: string | null;
	idMesin: string;
}

export const NAMA_TIER: Record<string, string> = {
	basic: 'Basic',
	pro: 'Pro',
	bisnis: 'Bisnis'
};

export function labelTier(status: StatusLisensi): string {
	if (!status.tier) return '—';
	return NAMA_TIER[status.tier] ?? status.tier;
}

export function labelPerangkat(status: StatusLisensi): string {
	if (status.batasPerangkat === null) return '—';
	if (status.batasPerangkat === 0) return 'Perangkat tanpa batas';
	const ke = status.perangkatKe ? `${status.perangkatKe} dari ` : '';
	return `Perangkat ${ke}${status.batasPerangkat}`;
}

export function statusLisensi(): Promise<StatusLisensi> {
	return invoke<StatusLisensi>('status_lisensi');
}

export function aktivasiLisensi(kode: string): Promise<StatusLisensi> {
	return invoke<StatusLisensi>('aktivasi_lisensi', { kode });
}

export function idMesin(): Promise<string> {
	return invoke<string>('id_mesin');
}

export function hapusLisensi(masterPassword: string): Promise<void> {
	return invoke('hapus_lisensi', { masterPassword });
}
