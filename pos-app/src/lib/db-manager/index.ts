import { invoke } from '@tauri-apps/api/core';

export function verifyMasterPassword(password: string): Promise<boolean> {
	return invoke('verify_master_password', { password });
}

export function setMasterPassword(oldPassword: string, newPassword: string): Promise<void> {
	return invoke('set_master_password', { oldPassword, newPassword });
}

export function backupDatabase(destPath: string): Promise<void> {
	return invoke('backup_database', { destPath });
}

export function validateZipBackup(zipPath: string): Promise<void> {
	return invoke('validate_zip_backup', { zipPath });
}

export function restoreDatabase(zipPath: string): Promise<void> {
	return invoke('restore_database', { zipPath });
}

export function resetDatabase(admin: {
	nama: string;
	username: string;
	password: string;
}): Promise<void> {
	return invoke('reset_database', {
		adminNama: admin.nama,
		adminUsername: admin.username,
		adminPassword: admin.password
	});
}

export function relaunchApp(): Promise<void> {
	return invoke('relaunch_app');
}
