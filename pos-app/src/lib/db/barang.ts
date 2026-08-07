import { getDb } from './index';
import type { Barang } from '$lib/types';

type BarangRow = {
	id: number;
	nama: string;
	harga: number;
	qty: number | null;
	barcode: string | null;
};

function toBarang(row: BarangRow): Barang {
	return row;
}

export async function listBarang(): Promise<Barang[]> {
	const db = await getDb();
	const rows = await db.select<BarangRow[]>('SELECT id, nama, harga, qty, barcode FROM barang ORDER BY nama');
	return rows.map(toBarang);
}

export async function cariBarangByBarcode(barcode: string): Promise<Barang | null> {
	const db = await getDb();
	const rows = await db.select<BarangRow[]>(
		'SELECT id, nama, harga, qty, barcode FROM barang WHERE barcode = $1',
		[barcode]
	);
	return rows[0] ? toBarang(rows[0]) : null;
}

export async function tambahBarang(input: {
	nama: string;
	harga: number;
	qty: number | null;
	barcode: string | null;
}): Promise<number> {
	const db = await getDb();
	const result = await db.execute(
		'INSERT INTO barang (nama, harga, qty, barcode) VALUES ($1, $2, $3, $4)',
		[input.nama, input.harga, input.qty, input.barcode]
	);
	return result.lastInsertId as number;
}

export async function updateBarang(
	id: number,
	input: { nama: string; harga: number; qty: number | null; barcode: string | null }
): Promise<void> {
	const db = await getDb();
	await db.execute('UPDATE barang SET nama = $1, harga = $2, qty = $3, barcode = $4 WHERE id = $5', [
		input.nama,
		input.harga,
		input.qty,
		input.barcode,
		id
	]);
}

export async function hapusBarang(id: number): Promise<void> {
	const db = await getDb();
	await db.execute('DELETE FROM barang WHERE id = $1', [id]);
}

export async function kurangiStokBarang(items: { barangId: number; jumlah: number }[]): Promise<void> {
	const db = await getDb();
	for (const item of items) {
		await db.execute(
			'UPDATE barang SET qty = MAX(qty - $1, 0) WHERE id = $2 AND qty IS NOT NULL',
			[item.jumlah, item.barangId]
		);
	}
}
