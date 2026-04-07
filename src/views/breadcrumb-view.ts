import { App, MarkdownPostProcessorContext, TFile, TFolder } from 'obsidian';
import type { AiJupyterSettings } from '../settings-data';

export class BreadcrumbProcessor {
	private app: App;
	private settings: AiJupyterSettings;

	constructor(app: App, settings: AiJupyterSettings) {
		this.app = app;
		this.settings = settings;
	}

	updateSettings(settings: AiJupyterSettings): void {
		this.settings = settings;
	}

	getProcessor(): (el: HTMLElement, ctx: MarkdownPostProcessorContext) => void {
		return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			if (!this.settings.showBreadcrumbs) return;

			const filePath = ctx.sourcePath;
			if (!filePath) return;

			// Only show breadcrumbs for detail, diff, and test documents
			const isDetail = filePath.startsWith(this.settings.detailsFolder + '/');
			const isDiff = filePath.startsWith(this.settings.diffsFolder + '/');
			const isTest = filePath.startsWith(this.settings.testsFolder + '/');
			if (!isDetail && !isDiff && !isTest) return;

			// Only process the first element (to avoid duplicate breadcrumbs)
			const sectionInfo = ctx.getSectionInfo(el);
			if (!sectionInfo || sectionInfo.lineStart !== 0) return;

			const breadcrumb = this.buildBreadcrumb(filePath);
			if (!breadcrumb.length) return;

			const nav = createDiv({ cls: 'aijupyter-breadcrumb' });

			for (let i = 0; i < breadcrumb.length; i++) {
				const item = breadcrumb[i];
				if (i > 0) {
					nav.createSpan({ cls: 'aijupyter-breadcrumb-separator', text: ' > ' });
				}

				if (i === breadcrumb.length - 1) {
					nav.createSpan({ cls: 'aijupyter-breadcrumb-current', text: item.name });
				} else {
					const link = nav.createSpan({ cls: 'aijupyter-breadcrumb-item', text: item.name });
					const linkPath = item.path;
					link.addEventListener('click', () => {
						this.app.workspace.openLinkText(linkPath, '', false);
					});
				}
			}

			el.prepend(nav);
		};
	}

	private buildBreadcrumb(filePath: string): { name: string; path: string }[] {
		const crumbs: { name: string; path: string }[] = [];
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return crumbs;

		// Get frontmatter
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;

		if (filePath.startsWith(this.settings.detailsFolder + '/')) {
			// L1 detail doc: breadcrumb = idea > current
			if (fm?.idea) {
				const ideaMatch = String(fm.idea).match(/\[\[([^\]]+)\]\]/);
				if (ideaMatch) {
					const ideaPath = `${this.settings.ideasFolder}/${ideaMatch[1]}.md`;
					crumbs.push({ name: ideaMatch[1], path: ideaPath });
				}
			}
			crumbs.push({ name: file.basename, path: filePath });
		} else if (filePath.startsWith(this.settings.diffsFolder + '/') || filePath.startsWith(this.settings.testsFolder + '/')) {
			// L2 doc: breadcrumb = idea > detail > current
			if (fm?.detail) {
				const detailMatch = String(fm.detail).match(/\[\[([^\]]+)\]\]/);
				if (detailMatch) {
					const detailSlug = detailMatch[1];
					// Try to find the detail file to get the idea
					const detailFile = this.findDetailFile(detailSlug);
					if (detailFile) {
						const detailCache = this.app.metadataCache.getFileCache(detailFile);
						const detailFm = detailCache?.frontmatter;
						if (detailFm?.idea) {
							const ideaMatch = String(detailFm.idea).match(/\[\[([^\]]+)\]\]/);
							if (ideaMatch) {
								const ideaPath = `${this.settings.ideasFolder}/${ideaMatch[1]}.md`;
								crumbs.push({ name: ideaMatch[1], path: ideaPath });
							}
						}
						crumbs.push({ name: detailSlug, path: detailFile.path });
					}
				}
			}
			crumbs.push({ name: file.basename, path: filePath });
		}

		return crumbs;
	}

	private findDetailFile(slug: string): TFile | null {
		const detailsFolder = this.app.vault.getAbstractFileByPath(this.settings.detailsFolder);
		if (!(detailsFolder instanceof TFolder)) return null;
		return this.searchFolder(detailsFolder, slug);
	}

	private searchFolder(folder: TFolder, basename: string): TFile | null {
		for (const child of folder.children) {
			if (child instanceof TFile && child.basename === basename) return child;
			if (child instanceof TFolder) {
				const found = this.searchFolder(child, basename);
				if (found) return found;
			}
		}
		return null;
	}
}
