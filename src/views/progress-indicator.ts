import { Notice } from 'obsidian';

/**
 * A progress indicator that displays a persistent Notice with:
 * - Current status text (what is happening right now)
 * - A progress bar (indeterminate pulse or determinate fill)
 * - Step info (e.g. "3 / 7")
 * - Elapsed time ticker (updates every second)
 */
export class ProgressIndicator {
	private notice: Notice | null = null;
	private statusEl: HTMLElement | null = null;
	private barFillEl: HTMLElement | null = null;
	private stepEl: HTMLElement | null = null;
	private timerEl: HTMLElement | null = null;

	private startTime = 0;
	private timerInterval: ReturnType<typeof setInterval> | null = null;

	/** Show the progress indicator. It stays visible until dismiss() is called. */
	show(title: string): void {
		this.startTime = Date.now();

		const fragment = document.createDocumentFragment();
		const container = document.createElement('div');
		container.className = 'aijupyter-gen-progress';

		// Title row: title on left, elapsed time on right
		const header = container.createEl('div', { cls: 'aijupyter-gen-progress-header' });
		header.createEl('span', { cls: 'aijupyter-gen-progress-title', text: title });
		const timer = header.createEl('span', { cls: 'aijupyter-gen-progress-timer', text: '0s' });

		// Status text (current operation)
		const status = container.createEl('div', {
			cls: 'aijupyter-gen-progress-status',
			text: '',
		});

		// Progress bar
		const barContainer = container.createEl('div', { cls: 'aijupyter-gen-progress-bar' });
		const barFill = barContainer.createEl('div', { cls: 'aijupyter-gen-progress-bar-fill' });
		barFill.style.width = '0%';

		// Step counter
		const step = container.createEl('div', {
			cls: 'aijupyter-gen-progress-step',
			text: '',
		});

		fragment.appendChild(container);

		this.notice = new Notice(fragment, 0);
		this.statusEl = status;
		this.barFillEl = barFill;
		this.stepEl = step;
		this.timerEl = timer;

		// Tick elapsed time every second
		this.timerInterval = setInterval(() => {
			if (this.timerEl) {
				const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
				this.timerEl.textContent = elapsed < 60
					? `${elapsed}s`
					: `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
			}
		}, 1000);
	}

	/** Switch to indeterminate (pulsing) mode for unknown-duration tasks. */
	setIndeterminate(status: string): void {
		if (this.statusEl) this.statusEl.textContent = status;
		if (this.barFillEl) {
			this.barFillEl.style.width = '100%';
			this.barFillEl.classList.add('aijupyter-gen-progress-bar-fill-indeterminate');
		}
		if (this.stepEl) this.stepEl.textContent = '';
	}

	/** Switch to determinate mode and set status text. */
	setDeterminate(status: string): void {
		if (this.statusEl) this.statusEl.textContent = status;
		if (this.barFillEl) {
			this.barFillEl.classList.remove('aijupyter-gen-progress-bar-fill-indeterminate');
			this.barFillEl.style.width = '0%';
		}
		if (this.stepEl) this.stepEl.textContent = '';
	}

	/** Update determinate progress. */
	update(current: number, total: number, status?: string): void {
		const pct = total > 0 ? Math.round((current / total) * 100) : 0;
		if (this.barFillEl) this.barFillEl.style.width = `${pct}%`;
		if (status && this.statusEl) this.statusEl.textContent = status;
		if (this.stepEl) this.stepEl.textContent = `${current} / ${total}`;
	}

	/** Dismiss and clean up. */
	dismiss(): void {
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
			this.timerInterval = null;
		}
		if (this.notice) {
			this.notice.hide();
			this.notice = null;
		}
		this.statusEl = null;
		this.barFillEl = null;
		this.stepEl = null;
		this.timerEl = null;
	}
}
