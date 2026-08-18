import ExcelJS from 'exceljs';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import type { KasBon, Penjualan, Ringkasan } from '$lib/types';
import { formatTanggal, formatTanggalJam, formatTanggalLokal } from '$lib/utils/format';

const HIJAU = 'FF2F6E4F';
const HIJAU_MUDA = 'FFE8F3EC';
const ABU = 'FFF4F4F2';
const RUPIAH_FMT = '"Rp"#,##0';

const BORDER_TIPIS: Partial<ExcelJS.Borders> = {
	top: { style: 'thin', color: { argb: 'FFE0E0DC' } },
	bottom: { style: 'thin', color: { argb: 'FFE0E0DC' } },
	left: { style: 'thin', color: { argb: 'FFE0E0DC' } },
	right: { style: 'thin', color: { argb: 'FFE0E0DC' } }
};

function formatTanggalFile() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function judulSheet(
	ws: ExcelJS.Worksheet,
	teks: string,
	kolomTerakhir: number,
	periode?: string
) {
	ws.mergeCells(1, 1, 1, kolomTerakhir);
	const cell = ws.getCell(1, 1);
	cell.value = teks;
	cell.font = { bold: true, size: 15, color: { argb: HIJAU } };
	cell.alignment = { vertical: 'middle' };
	ws.getRow(1).height = 26;

	ws.mergeCells(2, 1, 2, kolomTerakhir);
	const sub = ws.getCell(2, 1);
	sub.value = periode
		? `Periode ${periode} — dicetak ${new Date().toLocaleString('id-ID')}`
		: `Dicetak ${new Date().toLocaleString('id-ID')}`;
	sub.font = { italic: true, size: 9, color: { argb: 'FF767671' } };
	ws.getRow(2).height = 16;
}

function styleHeaderBaris(ws: ExcelJS.Worksheet, rowIndex: number, jumlahKolom: number) {
	const row = ws.getRow(rowIndex);
	for (let c = 1; c <= jumlahKolom; c++) {
		const cell = row.getCell(c);
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HIJAU } };
		cell.alignment = { vertical: 'middle', horizontal: 'left' };
		cell.border = BORDER_TIPIS;
	}
	row.height = 22;
}

function styleBarisData(ws: ExcelJS.Worksheet, rowIndex: number, jumlahKolom: number, zebra: boolean) {
	const row = ws.getRow(rowIndex);
	for (let c = 1; c <= jumlahKolom; c++) {
		const cell = row.getCell(c);
		cell.border = BORDER_TIPIS;
		if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ABU } };
	}
}

type BarisRingkasan = { label: string; nilai: number; rupiah?: boolean };

/**
 * Blok "judul + daftar label/nilai" yang dipakai sheet Dashboard dan Hari Ini.
 * Format rupiah ditentukan eksplisit per baris — sebelumnya ditebak dari kata
 * "total" pada label, sehingga jumlah transaksi (sebuah cacah) ikut tercetak "Rp".
 */
function tambahBagian(ws: ExcelJS.Worksheet, judul: string, baris: BarisRingkasan[]) {
	const rJudul = ws.lastRow!.number + 2;
	ws.mergeCells(rJudul, 1, rJudul, 2);
	const cellJudul = ws.getCell(rJudul, 1);
	cellJudul.value = judul;
	cellJudul.font = { bold: true, size: 12, color: { argb: HIJAU } };
	cellJudul.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HIJAU_MUDA } };
	cellJudul.alignment = { vertical: 'middle' };
	ws.getRow(rJudul).height = 20;

	baris.forEach((b, i) => {
		const r = rJudul + 1 + i;
		ws.getCell(r, 1).value = b.label;
		ws.getCell(r, 2).value = b.nilai;
		ws.getCell(r, 2).numFmt = b.rupiah ? RUPIAH_FMT : '#,##0';
		ws.getCell(r, 1).border = BORDER_TIPIS;
		ws.getCell(r, 2).border = BORDER_TIPIS;
	});
}

const HEADER_PENJUALAN = [
	'Waktu',
	'Kasir',
	'Barang',
	'Jumlah',
	'Harga Satuan',
	'Subtotal',
	'Total Transaksi'
];

const LEBAR_PENJUALAN = [
	{ width: 22 },
	{ width: 14 },
	{ width: 26 },
	{ width: 9 },
	{ width: 15 },
	{ width: 15 },
	{ width: 17 }
];

/** Tabel transaksi (satu baris per item, kolom transaksi di-merge) untuk dua sheet. */
function tulisTabelPenjualan(
	ws: ExcelJS.Worksheet,
	penjualan: Penjualan[],
	rHeader: number,
	bekukan: boolean
) {
	const header = HEADER_PENJUALAN;
	header.forEach((h, i) => (ws.getCell(rHeader, i + 1).value = h));
	styleHeaderBaris(ws, rHeader, header.length);

	let r = rHeader + 1;
	let zebra = false;

	if (penjualan.length === 0) {
		ws.mergeCells(r, 1, r, header.length);
		ws.getCell(r, 1).value = 'Belum ada penjualan';
		ws.getCell(r, 1).alignment = { horizontal: 'center' };
		ws.getCell(r, 1).font = { italic: true, color: { argb: 'FF767671' } };
	}

	for (const p of penjualan) {
		const baseRow = r;
		const items = p.items.length > 0 ? p.items : [{ nama: '-', harga: 0, jumlah: 0, barangId: 0 }];

		items.forEach((item, i) => {
			const row = ws.getRow(r);
			// Tanggal diformat dulu: kolom di DB berisi UTC, kalau ditulis mentah
			// jam & tanggalnya meleset sebesar offset zona.
			row.getCell(1).value = i === 0 ? formatTanggalJam(p.tanggal) : '';
			row.getCell(2).value = i === 0 ? p.kasir : '';
			row.getCell(3).value = item.nama;
			row.getCell(4).value = item.jumlah || '';
			row.getCell(5).value = item.harga || '';
			row.getCell(5).numFmt = RUPIAH_FMT;
			row.getCell(6).value = item.harga && item.jumlah ? item.harga * item.jumlah : '';
			row.getCell(6).numFmt = RUPIAH_FMT;
			row.getCell(7).value = i === 0 ? p.total : '';
			row.getCell(7).numFmt = RUPIAH_FMT;
			row.getCell(7).font = { bold: true };
			styleBarisData(ws, r, header.length, zebra);
			r++;
		});

		if (items.length > 1) {
			ws.mergeCells(baseRow, 1, r - 1, 1);
			ws.mergeCells(baseRow, 2, r - 1, 2);
			ws.mergeCells(baseRow, 7, r - 1, 7);
			ws.getCell(baseRow, 1).alignment = { vertical: 'top' };
			ws.getCell(baseRow, 2).alignment = { vertical: 'top' };
			ws.getCell(baseRow, 7).alignment = { vertical: 'top' };
		}
		zebra = !zebra;
	}

	ws.autoFilter = { from: { row: rHeader, column: 1 }, to: { row: rHeader, column: header.length } };
	if (bekukan) ws.views = [{ state: 'frozen', ySplit: rHeader }];
}

function buatSheetDashboard(
	wb: ExcelJS.Workbook,
	penjualan: Penjualan[],
	kasbon: KasBon[],
	periode?: string
) {
	const ws = wb.addWorksheet('Dashboard');
	ws.columns = [{ width: 26 }, { width: 20 }];

	judulSheet(ws, 'Laporan Kios Sumur Yacob', 2, periode);

	const totalPenjualan = penjualan.reduce((sum, p) => sum + p.total, 0);
	const totalBon = kasbon.reduce((sum, k) => sum + k.total, 0);
	const bonAktif = kasbon.filter((k) => k.status === 'belum_lunas');
	const bonLunas = kasbon.filter((k) => k.status === 'lunas');
	const totalBelumLunas = bonAktif.reduce((sum, k) => sum + k.sisa, 0);

	tambahBagian(ws, 'Ringkasan Penjualan', [
		{ label: 'Total Transaksi', nilai: penjualan.length },
		{ label: 'Total Penjualan', nilai: totalPenjualan, rupiah: true }
	]);

	tambahBagian(ws, 'Ringkasan Kas Bon', [
		{ label: 'Jumlah Bon', nilai: kasbon.length },
		{ label: 'Total Nilai Bon', nilai: totalBon, rupiah: true },
		{ label: 'Bon Belum Lunas', nilai: bonAktif.length },
		{ label: 'Total Belum Dibayar', nilai: totalBelumLunas, rupiah: true },
		{ label: 'Bon Lunas', nilai: bonLunas.length }
	]);
}

function buatSheetPenjualan(wb: ExcelJS.Workbook, penjualan: Penjualan[], periode?: string) {
	const ws = wb.addWorksheet('Penjualan');
	ws.columns = [...LEBAR_PENJUALAN];

	judulSheet(ws, 'Laporan Penjualan', HEADER_PENJUALAN.length, periode);
	tulisTabelPenjualan(ws, penjualan, 4, true);
}

/**
 * Sheet khusus hari ini, sengaja ditaruh paling depan supaya jadi sheet yang
 * terbuka pertama kali — angka harian yang paling sering dilihat.
 * Isinya selalu data hari ini, tidak ikut filter tab/rentang yang sedang aktif.
 */
function buatSheetHariIni(
	wb: ExcelJS.Workbook,
	data: { label: string; ringkasan: Ringkasan; penjualan: Penjualan[] }
) {
	const ws = wb.addWorksheet('Hari Ini');
	ws.columns = [...LEBAR_PENJUALAN];

	judulSheet(ws, 'Penjualan Hari Ini', HEADER_PENJUALAN.length, data.label);

	const r = data.ringkasan;
	tambahBagian(ws, 'Ringkasan Hari Ini', [
		{ label: 'Total Penjualan', nilai: r.totalPenjualan, rupiah: true },
		{ label: 'Jumlah Transaksi', nilai: r.jumlahTransaksi },
		{ label: 'Rata-rata per Transaksi', nilai: r.rataRata, rupiah: true }
	]);

	tambahBagian(ws, 'Kas Bon Hari Ini', [
		{ label: 'Bon Baru', nilai: r.bonBaru, rupiah: true },
		{ label: 'Jumlah Bon Baru', nilai: r.jumlahBon },
		{ label: 'Bon Dibayar', nilai: r.bonDibayar, rupiah: true },
		{ label: 'Uang Masuk (tunai + bon dibayar)', nilai: r.totalPenjualan + r.bonDibayar, rupiah: true }
	]);

	const rHeader = ws.lastRow!.number + 2;
	tulisTabelPenjualan(ws, data.penjualan, rHeader, false);
}

function buatSheetBon(wb: ExcelJS.Workbook, kasbon: KasBon[], periode?: string) {
	const ws = wb.addWorksheet('Bon');
	const header = [
		'Pengutang',
		'Tanggal',
		'Jatuh Tempo',
		'Barang',
		'Jumlah',
		'Harga Satuan',
		'Subtotal',
		'Total Bon',
		'Sudah Dibayar',
		'Sisa',
		'Status'
	];
	ws.columns = [
		{ width: 18 },
		{ width: 20 },
		{ width: 20 },
		{ width: 24 },
		{ width: 9 },
		{ width: 15 },
		{ width: 15 },
		{ width: 15 },
		{ width: 15 },
		{ width: 15 },
		{ width: 13 }
	];

	judulSheet(ws, 'Laporan Kas Bon', header.length, periode);

	const rHeader = 4;
	header.forEach((h, i) => (ws.getCell(rHeader, i + 1).value = h));
	styleHeaderBaris(ws, rHeader, header.length);

	let r = rHeader + 1;
	let zebra = false;

	if (kasbon.length === 0) {
		ws.mergeCells(r, 1, r, header.length);
		ws.getCell(r, 1).value = 'Belum ada kas bon';
		ws.getCell(r, 1).alignment = { horizontal: 'center' };
		ws.getCell(r, 1).font = { italic: true, color: { argb: 'FF767671' } };
	}

	for (const k of kasbon) {
		const baseRow = r;
		const statusLabel = k.status === 'lunas' ? 'Lunas' : 'Belum Lunas';
		const items = k.items.length > 0 ? k.items : [{ nama: '-', harga: 0, jumlah: 0, barangId: 0 }];

		items.forEach((item, i) => {
			const row = ws.getRow(r);
			row.getCell(1).value = i === 0 ? k.namaPengutang : '';
			row.getCell(2).value = i === 0 ? formatTanggal(k.tanggal) : '';
			// jatuh_tempo disimpan sebagai tanggal polos lokal, bukan datetime UTC
			row.getCell(3).value = i === 0 ? (k.jatuhTempo ? formatTanggalLokal(k.jatuhTempo) : '-') : '';
			row.getCell(4).value = item.nama;
			row.getCell(5).value = item.jumlah || '';
			row.getCell(6).value = item.harga || '';
			row.getCell(6).numFmt = RUPIAH_FMT;
			row.getCell(7).value = item.harga && item.jumlah ? item.harga * item.jumlah : '';
			row.getCell(7).numFmt = RUPIAH_FMT;
			if (i === 0) {
				row.getCell(8).value = k.total;
				row.getCell(8).numFmt = RUPIAH_FMT;
				row.getCell(8).font = { bold: true };
				row.getCell(9).value = k.sudahDibayar;
				row.getCell(9).numFmt = RUPIAH_FMT;
				row.getCell(10).value = k.sisa;
				row.getCell(10).numFmt = RUPIAH_FMT;
				row.getCell(10).font = { bold: true };
				row.getCell(11).value = statusLabel;
				row.getCell(11).font = {
					bold: true,
					color: { argb: k.status === 'lunas' ? 'FF2F6E4F' : 'FFB3432F' }
				};
			}
			styleBarisData(ws, r, header.length, zebra);
			r++;
		});

		if (items.length > 1) {
			[1, 2, 3, 8, 9, 10, 11].forEach((col) => {
				ws.mergeCells(baseRow, col, r - 1, col);
				ws.getCell(baseRow, col).alignment = { vertical: 'top' };
			});
		}
		zebra = !zebra;
	}

	ws.autoFilter = { from: { row: rHeader, column: 1 }, to: { row: rHeader, column: header.length } };
	ws.views = [{ state: 'frozen', ySplit: rHeader }];
}

/**
 * `opts.periode` cuma keterangan yang dicetak di subjudul tiap sheet, dan
 * `opts.namaFile` mengganti nama file default — penyaringan datanya sendiri
 * dilakukan pemanggil, fungsi ini menulis apa pun array yang diberikan.
 */
export async function exportLaporanExcel(
	penjualan: Penjualan[],
	kasbon: KasBon[],
	opts?: {
		periode?: string;
		namaFile?: string;
		hariIni?: { label: string; ringkasan: Ringkasan; penjualan: Penjualan[] };
	}
): Promise<boolean> {
	const wb = new ExcelJS.Workbook();
	wb.creator = 'POS Kios Sumur Yacob';
	wb.created = new Date();

	if (opts?.hariIni) buatSheetHariIni(wb, opts.hariIni);
	buatSheetDashboard(wb, penjualan, kasbon, opts?.periode);
	buatSheetPenjualan(wb, penjualan, opts?.periode);
	buatSheetBon(wb, kasbon, opts?.periode);

	const path = await save({
		defaultPath: `${opts?.namaFile ?? `Laporan-${formatTanggalFile()}`}.xlsx`,
		filters: [{ name: 'Excel', extensions: ['xlsx'] }]
	});
	if (!path) return false;

	const buffer = await wb.xlsx.writeBuffer();
	await writeFile(path, new Uint8Array(buffer));
	return true;
}
