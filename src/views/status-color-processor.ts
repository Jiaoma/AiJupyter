import { App, MarkdownPostProcessorContext } from 'obsidian';
import type { AiJupyterSettings } from '../settings-data';
import type { StatusService } from '../services/status-service';

export class StatusColorProcessor {
	private app: App;
	private settings: AiJupyterSettings;
	private statusService: StatusService;

	constructor(app: App, settings: AiJupyterSettings, statusService: StatusService) {
		this.app = app;
		this.settings = settings;
		this.statusService = statusService;
	}

	updateSettings(settings: AiJupyterSettings): void {
		this.settings = settings;
	}

	getProcessor(): (el: HTMLElement, ctx: MarkdownPostProcessorContext) => void {
		return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			if (!this.settings.enableStatusColors) return;

			// Only colorize links in idea (L0) documents
			const filePath = ctx.sourcePath;
			if (!filePath.startsWith(this.settings.ideasFolder + '/')) return;

			// Find all internal links in the rendered HTML
			const internalLinks = el.querySelectorAll('a.internal-link');
			for (const link of Array.from(internalLinks)) {
				const href = link.getAttribute('href') || link.getAttribute('data-href') || '';
				if (!href) continue;

				// Get the detail slug from the link
				const slug = href.replace(/\.md$/, '');
				const status = this.statusService.getStatusForDetailSlug(slug);

				if (status === 'no-tests') continue;

				const statusClass = `aijupyter-status-${status}`;
				link.addClass(statusClass);
			}
		};
	}
}
