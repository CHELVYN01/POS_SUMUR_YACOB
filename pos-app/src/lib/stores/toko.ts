import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type TokoInfo = {
	nama: string;
	alamat: string;
};

const STORAGE_KEY = 'pos-toko-info';

const defaultToko: TokoInfo = {
	nama: 'Kios Sumur Yacob',
	alamat: ''
};

function load(): TokoInfo {
	if (!browser) return defaultToko;
	const saved = localStorage.getItem(STORAGE_KEY);
	if (!saved) return defaultToko;
	try {
		return { ...defaultToko, ...JSON.parse(saved) };
	} catch {
		return defaultToko;
	}
}

export const tokoInfo = writable<TokoInfo>(load());

tokoInfo.subscribe((value) => {
	if (!browser) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
});
