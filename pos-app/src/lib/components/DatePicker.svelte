<script lang="ts">
	let {
		value = $bindable(''),
		placeholder = 'Pilih tanggal',
		id = undefined
	}: { value?: string; placeholder?: string; id?: string } = $props();

	let open = $state(false);
	let wrapEl = $state<HTMLDivElement | null>(null);

	const hariLabel = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
	const bulanLabel = [
		'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
		'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
	];

	function parseValue(v: string): Date | null {
		if (!v) return null;
		const [y, m, d] = v.split('-').map(Number);
		if (!y || !m || !d) return null;
		return new Date(y, m - 1, d);
	}

	let today = new Date();
	let viewYear = $state(today.getFullYear());
	let viewMonth = $state(today.getMonth());

	$effect(() => {
		const parsed = parseValue(value);
		if (parsed) {
			viewYear = parsed.getFullYear();
			viewMonth = parsed.getMonth();
		}
	});

	let displayText = $derived.by(() => {
		const parsed = parseValue(value);
		if (!parsed) return '';
		return `${parsed.getDate()} ${bulanLabel[parsed.getMonth()]} ${parsed.getFullYear()}`;
	});

	let hariDalamBulan = $derived.by(() => {
		const firstDay = new Date(viewYear, viewMonth, 1).getDay();
		const jumlahHari = new Date(viewYear, viewMonth + 1, 0).getDate();
		const cells: (number | null)[] = [];
		for (let i = 0; i < firstDay; i++) cells.push(null);
		for (let d = 1; d <= jumlahHari; d++) cells.push(d);
		return cells;
	});

	function toISO(y: number, m: number, d: number) {
		return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	}

	function pilihTanggal(d: number) {
		value = toISO(viewYear, viewMonth, d);
		open = false;
	}

	function gantiBulan(delta: number) {
		let m = viewMonth + delta;
		let y = viewYear;
		if (m < 0) {
			m = 11;
			y -= 1;
		} else if (m > 11) {
			m = 0;
			y += 1;
		}
		viewMonth = m;
		viewYear = y;
	}

	function isSelected(d: number) {
		const parsed = parseValue(value);
		return !!parsed && parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth && parsed.getDate() === d;
	}

	function isToday(d: number) {
		return (
			today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d
		);
	}

	function bersihkan() {
		value = '';
		open = false;
	}

	function handleClickOutside(event: MouseEvent) {
		if (wrapEl && !wrapEl.contains(event.target as Node)) {
			open = false;
		}
	}

	$effect(() => {
		if (!open) return;
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	});
</script>

<div class="date-picker" bind:this={wrapEl}>
	<button type="button" class="date-trigger" {id} onclick={() => (open = !open)}>
		<span class:muted={!displayText}>{displayText || placeholder}</span>
		<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
			<rect x="3.5" y="5" width="17" height="15" rx="2" />
			<line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
			<line x1="8" y1="3" x2="8" y2="6.5" />
			<line x1="16" y1="3" x2="16" y2="6.5" />
		</svg>
	</button>

	{#if open}
		<div class="date-popup card">
			<div class="date-popup-header">
				<button type="button" class="nav-btn" onclick={() => gantiBulan(-1)} aria-label="Bulan sebelumnya">
					<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="15 18 9 12 15 6" />
					</svg>
				</button>
				<span class="date-popup-title">{bulanLabel[viewMonth]} {viewYear}</span>
				<button type="button" class="nav-btn" onclick={() => gantiBulan(1)} aria-label="Bulan berikutnya">
					<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="9 18 15 12 9 6" />
					</svg>
				</button>
			</div>

			<div class="date-grid date-grid-label">
				{#each hariLabel as h (h)}
					<span>{h}</span>
				{/each}
			</div>

			<div class="date-grid">
				{#each hariDalamBulan as d, i (i)}
					{#if d === null}
						<span></span>
					{:else}
						<button
							type="button"
							class="date-cell"
							class:selected={isSelected(d)}
							class:today={isToday(d) && !isSelected(d)}
							onclick={() => pilihTanggal(d)}
						>
							{d}
						</button>
					{/if}
				{/each}
			</div>

			<div class="date-popup-footer">
				<button type="button" class="link-btn" onclick={bersihkan}>Bersihkan</button>
				<button
					type="button"
					class="link-btn"
					onclick={() => {
						viewYear = today.getFullYear();
						viewMonth = today.getMonth();
						value = toISO(today.getFullYear(), today.getMonth(), today.getDate());
						open = false;
					}}
				>
					Hari ini
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.date-picker {
		position: relative;
	}

	.date-trigger {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		font-family: inherit;
		font-size: 0.95rem;
		padding: 0.55em 0.75em;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		text-align: left;
	}

	.date-trigger:hover {
		background: var(--bg);
	}

	.date-trigger .muted {
		color: var(--text-muted);
	}

	.date-trigger svg {
		flex-shrink: 0;
		color: var(--text-muted);
	}

	.date-popup {
		position: absolute;
		top: calc(100% + 0.4rem);
		left: 0;
		z-index: 50;
		width: 280px;
		padding: 0.9rem;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
	}

	.date-popup-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.7rem;
	}

	.date-popup-title {
		font-weight: 600;
		font-size: 0.9rem;
	}

	.nav-btn {
		width: 28px;
		height: 28px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		color: var(--text-muted);
	}

	.nav-btn:hover {
		background: var(--bg);
		color: var(--text);
	}

	.date-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
	}

	.date-grid-label {
		margin-bottom: 0.3rem;
	}

	.date-grid-label span {
		text-align: center;
		font-size: 0.72rem;
		color: var(--text-muted);
		padding: 0.2rem 0;
	}

	.date-cell {
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		color: var(--text);
		font-size: 0.85rem;
		border-radius: 8px;
		padding: 0;
	}

	.date-cell:hover {
		background: var(--bg);
	}

	.date-cell.today {
		color: var(--accent);
		font-weight: 600;
	}

	.date-cell.selected {
		background: var(--accent);
		color: #fff;
		font-weight: 600;
	}

	.date-popup-footer {
		display: flex;
		justify-content: space-between;
		margin-top: 0.7rem;
		padding-top: 0.7rem;
		border-top: 1px solid var(--border);
	}

	.link-btn {
		border: none;
		background: transparent;
		color: var(--accent);
		font-size: 0.8rem;
		padding: 0.2em 0.4em;
	}

	.link-btn:hover {
		background: var(--bg);
	}
</style>
