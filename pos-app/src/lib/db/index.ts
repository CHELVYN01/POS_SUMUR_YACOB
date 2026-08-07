import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';

let dbPromise: Promise<Database> | null = null;

const SEED_BARANG = [
	{ nama: 'Beras 5kg', harga: 65000, qty: 20, barcode: '8991002100017' },
	{ nama: 'Minyak Goreng 1L', harga: 18000, qty: 30, barcode: '8991002100024' },
	{ nama: 'Gula Pasir 1kg', harga: 16000, qty: 25, barcode: '8991002100031' },
	{ nama: 'Telur Ayam 1kg', harga: 28000, qty: 15, barcode: null },
	{ nama: 'Kopi Sachet', harga: 2000, qty: null, barcode: '8991002100048' },
	{ nama: 'Mie Instan', harga: 3500, qty: 50, barcode: '8991002100055' },
	{ nama: 'Air Mineral 600ml', harga: 4000, qty: 40, barcode: '8991002100062' },
	{ nama: 'Sabun Mandi', harga: 5000, qty: 12, barcode: null }
];

// Migration 0001 only creates schema (no seed rows), so a fresh install or a post-reset
// database always starts with zero users. Runs once per app-load, right after the sql plugin
// has finished migrating — doing this from Rust's `.setup()` hook is NOT safe, since
// tauri-plugin-sql only migrates lazily on this very first `Database.load()` call.
async function seedIfNeeded(db: Database): Promise<void> {
	const rows = await db.select<{ total: number }[]>('SELECT COUNT(*) as total FROM users');
	if ((rows[0]?.total ?? 0) > 0) return;

	const pendingAdmin = await invoke<{ nama: string; username: string; password: string } | null>(
		'take_pending_seed_admin'
	);

	if (pendingAdmin) {
		await db.execute(
			"INSERT INTO users (nama, username, password, role) VALUES ($1, $2, $3, 'admin')",
			[pendingAdmin.nama, pendingAdmin.username, pendingAdmin.password]
		);
		return;
	}

	await db.execute(
		"INSERT INTO users (nama, username, password, role) VALUES ('Sumur Yacob', 'sumuryacob', 'yacob', 'admin')"
	);
	for (const b of SEED_BARANG) {
		await db.execute('INSERT INTO barang (nama, harga, qty, barcode) VALUES ($1, $2, $3, $4)', [
			b.nama,
			b.harga,
			b.qty,
			b.barcode
		]);
	}
}

export function getDb(): Promise<Database> {
	if (!dbPromise) {
		dbPromise = Database.load('sqlite:pos.db').then(async (db) => {
			await seedIfNeeded(db);
			return db;
		});
	}
	return dbPromise;
}
