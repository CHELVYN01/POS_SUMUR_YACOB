/**
 * Rentang tanggal untuk laporan.
 *
 * `dari`/`sampai` selalu tanggal LOKAL format "YYYY-MM-DD" (inklusif keduanya) —
 * format yang sama dengan yang diemit DatePicker, dan yang dipakai di query lewat
 * date(tanggal, 'localtime') supaya batas harinya ikut jam mesin toko, bukan UTC.
 */

export type Periode = { dari: string; sampai: string };

export type PresetPeriode = 'semua' | 'hari' | 'minggu' | 'bulan' | 'tahun' | 'custom';

/** Date lokal → "YYYY-MM-DD" (tanpa lewat toISOString yang mengonversi ke UTC). */
export function toTanggalLokal(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Tanggal hari ini menurut jam mesin. Dipakai juga untuk mendeteksi pergantian hari. */
export function tanggalHariIni(): string {
	return toTanggalLokal(new Date());
}

export function hariIni(): Periode {
	const t = tanggalHariIni();
	return { dari: t, sampai: t };
}

/** Minggu berjalan, dimulai Senin. */
export function mingguIni(): Periode {
	const now = new Date();
	const hari = now.getDay(); // 0 = Minggu
	const mundur = hari === 0 ? 6 : hari - 1;
	const senin = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mundur);
	return { dari: toTanggalLokal(senin), sampai: tanggalHariIni() };
}

export function bulanIni(): Periode {
	const now = new Date();
	return {
		dari: toTanggalLokal(new Date(now.getFullYear(), now.getMonth(), 1)),
		sampai: tanggalHariIni()
	};
}

export function tahunIni(): Periode {
	const now = new Date();
	return {
		dari: toTanggalLokal(new Date(now.getFullYear(), 0, 1)),
		sampai: tanggalHariIni()
	};
}

/** N hari terakhir termasuk hari ini — untuk grafik dashboard. */
export function nHariTerakhir(n: number): Periode {
	const now = new Date();
	const mulai = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1));
	return { dari: toTanggalLokal(mulai), sampai: tanggalHariIni() };
}

/** Rentang yang mencakup semua data. */
export function sepanjangWaktu(): Periode {
	return { dari: '0000-01-01', sampai: '9999-12-31' };
}

export function periodeDariPreset(preset: PresetPeriode): Periode {
	switch (preset) {
		case 'semua':
			return sepanjangWaktu();
		case 'hari':
			return hariIni();
		case 'minggu':
			return mingguIni();
		case 'bulan':
			return bulanIni();
		case 'tahun':
			return tahunIni();
		default:
			return hariIni();
	}
}

function tanggalPendek(s: string) {
	const [y, m, d] = s.split('-').map(Number);
	if (!y || !m || !d) return s;
	return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
}

/** "18 Agt 2026" kalau satu hari, "1 Agt 2026 – 18 Agt 2026" kalau rentang. */
export function labelPeriode(p: Periode): string {
	if (p.dari === p.sampai) return tanggalPendek(p.dari);
	return `${tanggalPendek(p.dari)} – ${tanggalPendek(p.sampai)}`;
}

/** Potongan aman untuk nama file: "2026-08-18" atau "2026-08-01_sd_2026-08-18". */
export function slugPeriode(p: Periode): string {
	return p.dari === p.sampai ? p.dari : `${p.dari}_sd_${p.sampai}`;
}
