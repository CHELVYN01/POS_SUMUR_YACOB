import ExcelJS from 'exceljs';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import type { KasBon, Penjualan } from '$lib/types';

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

function judulSheet(ws: ExcelJS.Worksheet, teks: string, kolomTerakhir: number) {
	ws.mergeCells(1, 1, 1, kolomTerakhir);
	const cell = ws.getCell(1, 1);
	cell.value = teks;
	cell.font = { bold: true, size: 15, color: { argb: HIJAU } };
	cell.alignment = { vertical: 'middle' };
	ws.getRow(1).height = 26;

	ws.mergeCells(2, 1, 2, kolomTerakhir);
	const sub = ws.getCell(2, 1);
	sub.value = `Dicetak ${new Date().toLocaleString('id-ID')}`;
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

function buatSheetDashboard(wb: ExcelJS.Workbook, penjualan: Penjualan[], kasbon: KasBon[]) {
	const ws = wb.addWorksheet('Dashboard');
	ws.columns = [{ width: 26 }, { width: 20 }];

	judulSheet(ws, 'Laporan Kios Sumur Yacob', 2);

	const totalPenjualan = penjualan.reduce((sum, p) => sum + p.total, 0);
	const totalBon = kasbon.reduce((sum, k) => sum + k.total, 0);
	const bonAktif = kasbon.filter((k) => k.status === 'belum_lunas');
	const bonLunas = kasbon.filter((k) => k.status === 'lunas');
	const totalBelumLunas = bonAktif.reduce((sum, k) => sum + k.sisa, 0);

	function tambahBagian(judul: string, baris: [string, number][]) {
		const rJudul = ws.lastRow!.number + 2;
		ws.mergeCells(rJudul, 1, rJudul, 2);
		const cellJudul = ws.getCell(rJudul, 1);
		cellJudul.value = judul;
		cellJudul.font = { bold: true, size: 12, color: { argb: HIJAU } };
		cellJudul.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HIJAU_MUDA } };
		cellJudul.alignment = { vertical: 'middle' };
		ws.getRow(rJudul).height = 20;

		baris.forEach(([label, nilai], i) => {
			const r = rJudul + 1 + i;
			ws.getCell(r, 1).value = label;
			ws.getCell(r, 2).value = nilai;
			ws.getCell(r, 2).numFmt = Number.isInteger(nilai) && label.toLowerCase().includes('total') ? RUPIAH_FMT : '#,##0';
			ws.getCell(r, 1).border = BORDER_TIPIS;
			ws.getCell(r, 2).border = BORDER_TIPIS;
		});
	}

	tambahBagian('Ringkasan Penjualan', [
		['Total Transaksi', penjualan.length],
		['Total Penjualan', totalPenjualan]
	]);

	tambahBagian('Ringkasan Kas Bon', [
		['Jumlah Bon', kasbon.length],
		['Total Nilai Bon', totalBon],
		['Bon Belum Lunas', bonAktif.length],
		['Total Belum Dibayar', totalBelumLunas],
		['Bon Lunas', bonLunas.length]
	]);
}

function buatSheetPenjualan(wb: ExcelJS.Workbook, penjualan: Penjualan[]) {
	const ws = wb.addWorksheet('Penjualan');
	const header = ['Tanggal', 'Kasir', 'Barang', 'Jumlah', 'Harga Satuan', 'Subtotal', 'Total Transaksi'];
	ws.columns = [
		{ width: 20 },
		{ width: 14 },
		{ width: 26 },
		{ width: 9 },
		{ width: 15 },
		{ width: 15 },
		{ width: 17 }
	];

	judulSheet(ws, 'Laporan Penjualan', header.length);

	const rHeader = 4;
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
			row.getCell(1).value = i === 0 ? p.tanggal : '';
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
	ws.views = [{ state: 'frozen', ySplit: rHeader }];
}

function buatSheetBon(wb: ExcelJS.Workbook, kasbon: KasBon[]) {
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

	judulSheet(ws, 'Laporan Kas Bon', header.length);

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
			row.getCell(2).value = i === 0 ? k.tanggal : '';
			row.getCell(3).value = i === 0 ? (k.jatuhTempo ?? '-') : '';
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

export async function exportLaporanExcel(penjualan: Penjualan[], kasbon: KasBon[]): Promise<boolean> {
	const wb = new ExcelJS.Workbook();
	wb.creator = 'POS Kios Sumur Yacob';
	wb.created = new Date();

	buatSheetDashboard(wb, penjualan, kasbon);
	buatSheetPenjualan(wb, penjualan);
	buatSheetBon(wb, kasbon);

	const path = await save({
		defaultPath: `Laporan-${formatTanggalFile()}.xlsx`,
		filters: [{ name: 'Excel', extensions: ['xlsx'] }]
	});
	if (!path) return false;

	const buffer = await wb.xlsx.writeBuffer();
	await writeFile(path, new Uint8Array(buffer));
	return true;
}
