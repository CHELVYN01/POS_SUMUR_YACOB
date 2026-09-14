import { getDb } from './index';
import type { User } from '$lib/types';

type UserRow = {
	id: number;
	nama: string;
	username: string;
	role: 'admin' | 'kasir';
};

export async function listUsers(): Promise<User[]> {
	const db = await getDb();
	return db.select<UserRow[]>('SELECT id, nama, username, role FROM users ORDER BY nama');
}

export async function login(username: string, password: string): Promise<User | null> {
	const db = await getDb();
	const rows = await db.select<UserRow[]>(
		'SELECT id, nama, username, role FROM users WHERE username = $1 AND password = $2',
		[username, password]
	);
	return rows[0] ?? null;
}

/** `kecualiId` = user yang sedang diedit; username miliknya sendiri bukan bentrokan. */
export async function usernameTersedia(username: string, kecualiId?: number): Promise<boolean> {
	const db = await getDb();
	const rows = await db.select<{ id: number }[]>(
		'SELECT id FROM users WHERE username = $1 AND ($2 IS NULL OR id != $2)',
		[username, kecualiId ?? null]
	);
	return rows.length === 0;
}

export async function tambahUser(input: {
	nama: string;
	username: string;
	password: string;
	role: 'admin' | 'kasir';
}): Promise<number> {
	const db = await getDb();
	const result = await db.execute(
		'INSERT INTO users (nama, username, password, role) VALUES ($1, $2, $3, $4)',
		[input.nama, input.username, input.password, input.role]
	);
	return result.lastInsertId as number;
}

async function jumlahAdmin(): Promise<number> {
	const db = await getDb();
	const rows = await db.select<{ total: number }[]>(
		"SELECT COUNT(*) as total FROM users WHERE role = 'admin'"
	);
	return rows[0]?.total ?? 0;
}

/**
 * Password hanya diganti kalau diisi — kosong berarti tetap yang lama, supaya
 * mengubah nama/role tidak memaksa admin mengetik ulang password orang.
 */
export async function ubahUser(
	id: number,
	input: { nama: string; username: string; role: 'admin' | 'kasir'; password?: string }
): Promise<{ ok: boolean; error?: string }> {
	const db = await getDb();
	const rows = await db.select<UserRow[]>('SELECT id, nama, username, role FROM users WHERE id = $1', [
		id
	]);
	const target = rows[0];
	if (!target) return { ok: false, error: 'User tidak ditemukan' };

	// Menurunkan admin terakhir jadi kasir sama saja dengan menghapusnya:
	// tidak ada lagi yang bisa membuka Pengaturan.
	if (target.role === 'admin' && input.role !== 'admin' && (await jumlahAdmin()) <= 1) {
		return { ok: false, error: 'Tidak bisa mengubah role satu-satunya admin' };
	}

	if (input.password) {
		await db.execute(
			'UPDATE users SET nama = $1, username = $2, role = $3, password = $4 WHERE id = $5',
			[input.nama, input.username, input.role, input.password, id]
		);
	} else {
		await db.execute('UPDATE users SET nama = $1, username = $2, role = $3 WHERE id = $4', [
			input.nama,
			input.username,
			input.role,
			id
		]);
	}
	return { ok: true };
}

export async function hapusUser(id: number): Promise<{ ok: boolean; error?: string }> {
	const db = await getDb();
	const rows = await db.select<UserRow[]>('SELECT id, nama, username, role FROM users WHERE id = $1', [
		id
	]);
	const target = rows[0];
	if (!target) return { ok: false, error: 'User tidak ditemukan' };

	if (target.role === 'admin' && (await jumlahAdmin()) <= 1) {
		return { ok: false, error: 'Tidak bisa menghapus satu-satunya admin' };
	}

	await db.execute('DELETE FROM users WHERE id = $1', [id]);
	return { ok: true };
}
