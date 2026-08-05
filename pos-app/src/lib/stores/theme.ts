import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';

const stored = browser ? (localStorage.getItem('theme') as Theme | null) : null;

export const theme = writable<Theme>(stored ?? 'light');

theme.subscribe((value) => {
	if (!browser) return;
	document.documentElement.setAttribute('data-theme', value);
	localStorage.setItem('theme', value);
});

export function toggleTheme() {
	theme.update((t) => (t === 'light' ? 'dark' : 'light'));
}
