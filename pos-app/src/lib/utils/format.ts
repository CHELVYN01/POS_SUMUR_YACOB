/**
 * Format bersama untuk angka & waktu.
 *
 * Catatan waktu: kolom `tanggal` di SQLite diisi lewat DEFAULT (datetime('now')),
 * yang selalu menghasilkan UTC dengan format "YYYY-MM-DD HH:MM:SS". Semua konversi
 * ke waktu lokal harus lewat parseWaktuDb() — jangan diparse langsung, karena
 * new Date("2026-08-18T03:00:00") tanpa "Z" dianggap waktu lokal dan hasilnya
 * meleset sebesar offset zona (7 jam di WIB).
 */

export function formatRupiah(n: number) {
	return 'Rp' + n.toLocaleString('id-ID');
}

/** String tanggal dari DB (UTC) → Date. */
export function parseWaktuDb(s: string): Date {
	return new Date(s.replace(' ', 'T') + 'Z');
}

/** "18 Agt 2026" */
export function formatTanggal(s: string) {
	return parseWaktuDb(s).toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
}

/** "14:35" */
export function formatWaktu(s: string) {
	return parseWaktuDb(s).toLocaleTimeString('id-ID', {
		hour: '2-digit',
		minute: '2-digit'
	});
}

/** "18 Agt 2026, 14:35" */
export function formatTanggalJam(s: string) {
	return `${formatTanggal(s)}, ${formatWaktu(s)}`;
}

/**
 * Untuk kolom yang isinya tanggal polos lokal "YYYY-MM-DD" (mis. kasbon.jatuh_tempo
 * yang datang dari DatePicker), bukan datetime UTC. Diparse manual supaya tidak
 * kena pergeseran zona seperti new Date("2026-08-20") yang dianggap UTC midnight.
 */
export function formatTanggalLokal(s: string) {
	const [y, m, d] = s.split('-').map(Number);
	if (!y || !m || !d) return s;
	return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
}
