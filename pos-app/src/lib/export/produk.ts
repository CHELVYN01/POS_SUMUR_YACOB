import ExcelJS from 'exceljs';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import type { Barang } from '$lib/types';

const HIJAU = 'FF2F6E4F';
const ABU = 'FFF4F4F2';
const RUPIAH_FMT = '"Rp"#,##0';

const BORDER_TIPIS: Partial<ExcelJS.Borders> = {
	top: { style: 'thin', color: { argb: 'FFE0E0DC' } },
	bottom: { style: 'thin', color: { argb: 'FFE0E0DC' } },
	left: { style: 'thin', color: { argb: 'FFE0E0DC' } },
	right: { style: 'thin', color: { argb: 'FFE0E0DC' } }
};

/**
 * Nama sheet & judul kolom sekaligus jadi kontrak file: yang di-export harus bisa
 * dibaca lagi oleh importer di file yang sama. Pembacaan mencocokkan judul kolom
 * (bukan urutannya) supaya kolom yang digeser/disisipi user tidak merusak import.
 */
const NAMA_SHEET = 'Produk';
const HEADER = ['ID', 'Barcode', 'Nama Produk', 'Harga', 'Stok'] as const;
const LEBAR = [{ width: 8 }, { width: 20 }, { width: 32 }, { width: 14 }, { width: 10 }];
const BARIS_HEADER = 4;

function formatTanggalFile() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function exportProdukExcel(produk: Barang[]): Promise<boolean> {
	const wb = new ExcelJS.Workbook();
	wb.creator = 'POS Kios Sumur Yacob';
	wb.created = new Date();

	const ws = wb.addWorksheet(NAMA_SHEET);
	ws.columns = LEBAR;

	ws.mergeCells(1, 1, 1, HEADER.length);
	const judul = ws.getCell(1, 1);
	judul.value = 'Daftar Produk';
	judul.font = { bold: true, size: 15, color: { argb: HIJAU } };
	judul.alignment = { vertical: 'middle' };
	ws.getRow(1).height = 26;

	ws.mergeCells(2, 1, 2, HEADER.length);
	const sub = ws.getCell(2, 1);
	sub.value = `${produk.length} produk — dicetak ${new Date().toLocaleString('id-ID')}`;
	sub.font = { italic: true, size: 9, color: { argb: 'FF767671' } };
	ws.getRow(2).height = 16;

	ws.mergeCells(3, 1, 3, HEADER.length);
	const petunjuk = ws.getCell(3, 1);
	petunjuk.value =
		'Silakan edit Barcode / Nama / Harga / Stok, lalu import kembali lewat menu Produk. ' +
		'Kolom ID jangan diubah. Baris baru boleh ditambah di bawah (ID dikosongkan). ' +
		'Baris yang dihapus di sini TIDAK menghapus produk di aplikasi.';
	petunjuk.font = { size: 9, color: { argb: 'FF767671' } };
	petunjuk.alignment = { vertical: 'middle', wrapText: false };
	ws.getRow(3).height = 16;

	ws.getRow(BARIS_HEADER).values = [...HEADER];
	for (let c = 1; c <= HEADER.length; c++) {
		const cell = ws.getCell(BARIS_HEADER, c);
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HIJAU } };
		cell.alignment = { vertical: 'middle', horizontal: 'left' };
		cell.border = BORDER_TIPIS;
	}
	ws.getRow(BARIS_HEADER).height = 22;

	produk.forEach((b, i) => {
		const r = BARIS_HEADER + 1 + i;
		const row = ws.getRow(r);
		row.getCell(1).value = b.id;
		row.getCell(2).value = b.barcode ?? '';
		row.getCell(3).value = b.nama;
		row.getCell(4).value = b.harga;
		row.getCell(4).numFmt = RUPIAH_FMT;
		// stok tak dilacak ditulis kosong, bukan 0 — 0 berarti "habis", beda artinya
		row.getCell(5).value = b.qty === null ? '' : b.qty;

		for (let c = 1; c <= HEADER.length; c++) {
			row.getCell(c).border = BORDER_TIPIS;
			if (i % 2 === 1) {
				row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ABU } };
			}
		}
		// barcode panjang jangan diubah jadi notasi ilmiah oleh Excel
		row.getCell(2).numFmt = '@';
	});

	ws.autoFilter = {
		from: { row: BARIS_HEADER, column: 1 },
		to: { row: BARIS_HEADER, column: HEADER.length }
	};
	ws.views = [{ state: 'frozen', ySplit: BARIS_HEADER }];

	const path = await save({
		defaultPath: `Produk-${formatTanggalFile()}.xlsx`,
		filters: [{ name: 'Excel', extensions: ['xlsx'] }]
	});
	if (!path) return false;

	const buffer = await wb.xlsx.writeBuffer();
	await writeFile(path, new Uint8Array(buffer));
	return true;
}

export type BarisProduk = {
	/** nomor baris asli di file — dipakai supaya pesan error bisa ditunjuk user di Excel */
	baris: number;
	id: number | null;
	barcode: string;
	nama: string;
	harga: number;
	qty: number | null;
};

export type ErrorBaris = { baris: number; pesan: string };

export type HasilBaca = {
	namaFile: string;
	baris: BarisProduk[];
	error: ErrorBaris[];
};

/** Isi sel Excel bisa berupa rich text, rumus, atau hyperlink — semuanya diratakan jadi teks. */
function teksSel(cell: ExcelJS.Cell): string {
	const v = cell.value;
	if (v === null || v === undefined) return '';
	if (typeof v === 'string') return v.trim();
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	if (v instanceof Date) return v.toISOString();
	if (typeof v === 'object') {
		if ('richText' in v) return v.richText.map((t) => t.text).join('').trim();
		if ('result' in v) return v.result === null || v.result === undefined ? '' : String(v.result).trim();
		if ('text' in v) return String(v.text).trim();
	}
	return String(v).trim();
}

/**
 * Angka yang diketik user bisa datang sebagai "Rp 65.000" atau "65,000" — Excel
 * menyimpannya sebagai teks kalau formatnya tidak dikenali. Pemisah ribuan
 * gaya Indonesia (titik) dan gaya Inggris (koma) dibedakan dari polanya,
 * bukan ditebak dari locale mesin.
 */
function angkaSel(cell: ExcelJS.Cell): number | null {
	const v = cell.value;
	if (typeof v === 'number') return v;
	if (v && typeof v === 'object' && 'result' in v && typeof v.result === 'number') return v.result;

	const teks = teksSel(cell).replace(/rp/gi, '').replace(/[\s ]/g, '');
	if (!teks) return null;

	let bersih = teks;
	if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(teks)) {
		bersih = teks.replace(/\./g, '').replace(',', '.');
	} else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(teks)) {
		bersih = teks.replace(/,/g, '');
	} else {
		bersih = teks.replace(',', '.');
	}

	const n = Number(bersih);
	return Number.isFinite(n) ? n : NaN;
}

function normalJudul(s: string): string {
	return s.toLowerCase().replace(/[^a-z]/g, '');
}

/** Judul yang diterima per kolom — longgar supaya file lama/ketikan sendiri tetap terbaca. */
const ALIAS: Record<keyof Omit<BarisProduk, 'baris'>, string[]> = {
	id: ['id'],
	barcode: ['barcode', 'kodebarang', 'kode'],
	nama: ['namaproduk', 'nama', 'namabarang', 'produk', 'barang'],
	harga: ['harga', 'hargajual', 'hargarp'],
	qty: ['stok', 'qty', 'stokqty', 'jumlah', 'stock']
};

type PetaKolom = { [K in keyof typeof ALIAS]: number | null };

/**
 * Header dicari, tidak diasumsikan ada di baris 4: file yang sudah diedit user bisa
 * saja kehilangan baris judul di atasnya, atau justru bertambah.
 */
function cariHeader(ws: ExcelJS.Worksheet): { row: number; kolom: PetaKolom } | null {
	const batas = Math.min(ws.rowCount, 20);
	for (let r = 1; r <= batas; r++) {
		const row = ws.getRow(r);
		const kolom: PetaKolom = { id: null, barcode: null, nama: null, harga: null, qty: null };

		for (let c = 1; c <= Math.max(row.cellCount, 1); c++) {
			const judul = normalJudul(teksSel(row.getCell(c)));
			if (!judul) continue;
			for (const kunci of Object.keys(ALIAS) as (keyof typeof ALIAS)[]) {
				if (kolom[kunci] === null && ALIAS[kunci].includes(judul)) kolom[kunci] = c;
			}
		}

		// nama & harga adalah dua kolom yang tidak boleh hilang; ID dan Stok boleh tidak ada
		if (kolom.nama !== null && kolom.harga !== null && kolom.barcode !== null) {
			return { row: r, kolom };
		}
	}
	return null;
}

export class ImportError extends Error {}

/**
 * Membaca file yang dipilih user jadi baris mentah + daftar barisan yang ditolak.
 * Belum menyentuh database sama sekali — pencocokan dengan produk yang ada
 * dikerjakan `siapkanImportBarang()` di layer db.
 */
export async function bacaProdukExcel(): Promise<HasilBaca | null> {
	const path = await open({
		multiple: false,
		filters: [{ name: 'Excel', extensions: ['xlsx'] }]
	});
	if (!path || typeof path !== 'string') return null;

	const isi = await readFile(path);
	const wb = new ExcelJS.Workbook();
	try {
		// .buffer bisa lebih besar dari isi filenya kalau Uint8Array-nya cuma sebuah view;
		// dipotong dulu supaya ExcelJS tidak membaca byte sisa di belakangnya
		await wb.xlsx.load(isi.buffer.slice(isi.byteOffset, isi.byteOffset + isi.byteLength) as ArrayBuffer);
	} catch (e) {
		console.error('Gagal membaca file Excel:', e);
		throw new ImportError('File tidak bisa dibaca. Pastikan formatnya .xlsx, bukan .xls atau .csv.');
	}

	const ws = wb.getWorksheet(NAMA_SHEET) ?? wb.worksheets[0];
	if (!ws) throw new ImportError('File Excel tidak punya sheet apa pun.');

	const header = cariHeader(ws);
	if (!header) {
		throw new ImportError(
			'Judul kolom tidak ditemukan. File harus punya kolom Barcode, Nama Produk, dan Harga — ' +
				'paling aman pakai file hasil Export Excel dari halaman ini.'
		);
	}

	const { row: rHeader, kolom } = header;
	const baris: BarisProduk[] = [];
	const error: ErrorBaris[] = [];
	const barcodeTerpakai = new Map<string, number>();

	for (let r = rHeader + 1; r <= ws.rowCount; r++) {
		const row = ws.getRow(r);
		const barcode = kolom.barcode === null ? '' : teksSel(row.getCell(kolom.barcode));
		const nama = kolom.nama === null ? '' : teksSel(row.getCell(kolom.nama));
		const hargaSel = kolom.harga === null ? null : angkaSel(row.getCell(kolom.harga));
		const qtySel = kolom.qty === null ? null : angkaSel(row.getCell(kolom.qty));
		const idSel = kolom.id === null ? null : angkaSel(row.getCell(kolom.id));

		// baris kosong di tengah/akhir tabel itu wajar, bukan kesalahan
		if (!barcode && !nama && hargaSel === null && qtySel === null && idSel === null) continue;

		const pesan: string[] = [];

		if (!barcode) pesan.push('barcode kosong');
		if (!nama) pesan.push('nama produk kosong');

		if (hargaSel === null) pesan.push('harga kosong');
		else if (!Number.isFinite(hargaSel)) pesan.push('harga bukan angka');
		else if (hargaSel < 0) pesan.push('harga tidak boleh minus');

		if (qtySel !== null && !Number.isFinite(qtySel)) pesan.push('stok bukan angka');
		else if (qtySel !== null && qtySel < 0) pesan.push('stok tidak boleh minus');

		let id: number | null = null;
		if (idSel !== null) {
			if (!Number.isFinite(idSel) || idSel <= 0) pesan.push('ID tidak valid');
			else id = Math.trunc(idSel);
		}

		const sebelumnya = barcodeTerpakai.get(barcode);
		if (barcode && sebelumnya !== undefined) {
			pesan.push(`barcode ${barcode} dobel dengan baris ${sebelumnya}`);
		}

		if (pesan.length > 0) {
			error.push({ baris: r, pesan: pesan.join(', ') });
			continue;
		}

		if (barcode) barcodeTerpakai.set(barcode, r);
		baris.push({
			baris: r,
			id,
			barcode,
			nama,
			// harga & stok disimpan INTEGER di database; pecahan dibulatkan, bukan ditolak
			harga: Math.round(hargaSel as number),
			qty: qtySel === null ? null : Math.round(qtySel)
		});
	}

	const namaFile = path.split(/[\\/]/).pop() ?? path;
	return { namaFile, baris, error };
}
