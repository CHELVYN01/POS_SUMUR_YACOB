<script lang="ts">
	import { fly } from 'svelte/transition';
	import { toasts, tutupToast } from '$lib/stores/toast';
</script>

<div class="toast-wrap" role="status" aria-live="polite">
	{#each $toasts as t (t.id)}
		<div class="toast {t.jenis}" transition:fly={{ y: 16, duration: 180 }}>
			<span class="ikon" aria-hidden="true">
				{#if t.jenis === 'sukses'}✓{:else if t.jenis === 'error'}!{:else}i{/if}
			</span>
			<span class="pesan">{t.pesan}</span>
			<button type="button" class="tutup" onclick={() => tutupToast(t.id)} aria-label="Tutup pesan">
				×
			</button>
		</div>
	{/each}
</div>

<style>
	.toast-wrap {
		position: fixed;
		/* Di atas sidebar dan modal, tapi tetap jauh dari kolom scan supaya tidak
		   menutupi kursor yang sedang dipakai kasir. */
		bottom: 1.25rem;
		right: 1.25rem;
		z-index: 999;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: flex-end;
		pointer-events: none;
	}

	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 260px;
		max-width: 380px;
		padding: 0.7rem 0.85rem;
		border: 1px solid var(--border);
		border-left-width: 4px;
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
		font-size: 0.9rem;
	}

	.toast.sukses {
		border-left-color: var(--accent);
	}
	.toast.error {
		border-left-color: var(--danger);
	}
	.toast.info {
		border-left-color: var(--text-muted);
	}

	.ikon {
		flex-shrink: 0;
		width: 1.25rem;
		height: 1.25rem;
		display: grid;
		place-items: center;
		border-radius: 50%;
		font-size: 0.75rem;
		font-weight: 700;
		color: #fff;
	}
	.sukses .ikon {
		background: var(--accent);
	}
	.error .ikon {
		background: var(--danger);
	}
	.info .ikon {
		background: var(--text-muted);
	}

	.pesan {
		flex: 1;
		line-height: 1.35;
	}

	.tutup {
		flex-shrink: 0;
		border: none;
		background: none;
		color: var(--text-muted);
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 0.15rem;
	}
	.tutup:hover {
		color: var(--text);
	}
</style>
