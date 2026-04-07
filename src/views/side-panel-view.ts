import { ItemView, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import type { AiJupyterSettings } from '../settings-data';
import type { StatusService } from '../services/status-service';

export const SIDE_PANEL_VIEW_TYPE = 'aijupyter-side-panel';

export class SidePanelView extends ItemView {
	private settings: AiJupyterSettings;
	private statusService: StatusService;

	constructor(leaf: WorkspaceLeaf, settings: AiJupyterSettings, statusService: StatusService) {
		super(leaf);
		this.settings = settings;
		this.statusService = statusService;
	}

	getViewType(): string {
		return SIDE_PANEL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'AiJupyter 概览';
	}

	getIcon(): string {
		return 'layout-list';
	}

	updateSettings(settings: AiJupyterSettings): void {
		this.settings = settings;
	}

	async onOpen(): Promise<void> {
		await this.render();

		// Re-render when active file changes
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.render();
			})
		);
	}

	async refresh(): Promise<void> {
		await this.render();
	}

	private async render(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();

		const root = container.createDiv({ cls: 'aijupyter-side-panel' });

		// Get current active file
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			root.createEl('p', { text: '打开一个文档以查看概览', cls: 'aijupyter-loading' });
			return;
		}

		// Determine which idea this file belongs to
		const ideaFile = await this.findParentIdea(activeFile);
		if (!ideaFile) {
			root.createEl('p', { text: '当前文档不属于任何想法', cls: 'aijupyter-loading' });
			return;
		}

		const info = await this.statusService.getIdeaStatus(ideaFile);

		// Title
		root.createEl('h3', { text: info.ideaName });

		// Overall status badge
		const statusDiv = root.createDiv({ cls: 'aijupyter-side-panel-section' });
		const badge = statusDiv.createEl('span', { cls: 'aijupyter-badge' });
		const statusMap: Record<string, { text: string; cls: string }> = {
			'all-pass': { text: 'ALL PASS', cls: 'aijupyter-badge-pass' },
			'has-fail': { text: 'HAS FAIL', cls: 'aijupyter-badge-fail' },
			'in-progress': { text: 'IN PROGRESS', cls: 'aijupyter-badge-pending' },
			'no-tests': { text: 'NO TESTS', cls: '' },
		};
		const s = statusMap[info.overallStatus] || statusMap['no-tests'];
		badge.textContent = s.text;
		if (s.cls) badge.addClass(s.cls);

		// Test summary
		if (info.totalTests > 0) {
			const summaryDiv = root.createDiv({ cls: 'aijupyter-side-panel-section' });
			summaryDiv.createEl('div', {
				text: `${info.passedTests}/${info.totalTests} 用例通过`,
			});
			const progress = summaryDiv.createDiv({ cls: 'aijupyter-progress' });
			const rate = Math.round((info.passedTests / info.totalTests) * 100);
			const fill = progress.createDiv({
				cls: `aijupyter-progress-fill ${rate === 100 ? 'aijupyter-progress-fill-pass' : 'aijupyter-progress-fill-fail'}`,
			});
			fill.style.width = `${rate}%`;
		}

		// Document tree
		const treeSection = root.createDiv({ cls: 'aijupyter-side-panel-section' });
		treeSection.createEl('h3', { text: '文档树' });
		const tree = treeSection.createEl('ul', { cls: 'aijupyter-side-panel-tree' });

		// Idea root
		const ideaItem = tree.createEl('li');
		const ideaLink = ideaItem.createDiv({ cls: 'aijupyter-tree-item' });
		ideaLink.createSpan({ cls: 'aijupyter-tree-icon', text: '\u{1F4CB}' });
		ideaLink.createSpan({ text: info.ideaName });
		ideaLink.addEventListener('click', () => {
			this.app.workspace.openLinkText(ideaFile.path, '', false);
		});

		// Details
		const subfolder = info.ideaName.replace(/^idea-/, '');
		const detailsList = ideaItem.createEl('ul');
		for (const detail of info.details) {
			const detailItem = detailsList.createEl('li');
			const detailLink = detailItem.createDiv({ cls: 'aijupyter-tree-item' });

			const detailStatus = this.statusService.getStatusForDetailSlug(detail.slug);
			const iconMap: Record<string, string> = {
				'all-pass': '\u2705',
				'has-fail': '\u274C',
				'in-progress': '\u23F3',
				'no-tests': '\u25CB',
			};
			detailLink.createSpan({ cls: 'aijupyter-tree-icon', text: iconMap[detailStatus] || '\u25CB' });
			detailLink.createSpan({ text: detail.slug });
			detailLink.addEventListener('click', () => {
				this.app.workspace.openLinkText(detail.filePath, '', false);
			});

			// Sub-items: diffs and tests
			const subList = detailItem.createEl('ul');

			// Find diffs for this detail
			const diffsPath = `${this.settings.diffsFolder}/${subfolder}`;
			const diffsFolder = this.app.vault.getAbstractFileByPath(diffsPath);
			if (diffsFolder instanceof TFolder) {
				for (const child of diffsFolder.children) {
					if (child instanceof TFile && child.basename.startsWith(detail.slug) && child.basename.includes('diff')) {
						const diffItem = subList.createEl('li');
						const diffLink = diffItem.createDiv({ cls: 'aijupyter-tree-item' });
						diffLink.createSpan({ cls: 'aijupyter-tree-icon', text: '\u{1F4DD}' });
						diffLink.createSpan({ text: child.basename });
						diffLink.addEventListener('click', () => {
							this.app.workspace.openLinkText(child.path, '', false);
						});
					}
				}
			}

			// Find tests for this detail
			const testsPath = `${this.settings.testsFolder}/${subfolder}`;
			const testsFolder = this.app.vault.getAbstractFileByPath(testsPath);
			if (testsFolder instanceof TFolder) {
				for (const child of testsFolder.children) {
					if (child instanceof TFile && child.basename.startsWith(detail.slug) && child.basename.includes('test')) {
						const testItem = subList.createEl('li');
						const testLink = testItem.createDiv({ cls: 'aijupyter-tree-item' });
						testLink.createSpan({ cls: 'aijupyter-tree-icon', text: '\u{1F9EA}' });
						testLink.createSpan({ text: child.basename });
						testLink.addEventListener('click', () => {
							this.app.workspace.openLinkText(child.path, '', false);
						});
					}
				}
			}
		}
	}

	private async findParentIdea(file: TFile): Promise<TFile | null> {
		const path = file.path;

		// If the file is in the ideas folder, it IS the idea
		if (path.startsWith(this.settings.ideasFolder + '/')) {
			return file;
		}

		// If in details/tests/diffs, try to find the parent idea
		const content = await this.app.vault.read(file);
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;

		// Check for idea link in frontmatter
		if (fm?.idea) {
			const ideaMatch = String(fm.idea).match(/\[\[([^\]]+)\]\]/);
			if (ideaMatch) {
				const ideaPath = `${this.settings.ideasFolder}/${ideaMatch[1]}.md`;
				const ideaFile = this.app.vault.getAbstractFileByPath(ideaPath);
				if (ideaFile instanceof TFile) return ideaFile;
			}
		}

		// Check for detail link in frontmatter (for L2 docs)
		if (fm?.detail) {
			const detailMatch = String(fm.detail).match(/\[\[([^\]]+)\]\]/);
			if (detailMatch) {
				const detailSlug = detailMatch[1];
				// Search for the detail file to find its parent idea
				const detailsFolder = this.app.vault.getAbstractFileByPath(this.settings.detailsFolder);
				if (detailsFolder instanceof TFolder) {
					const detailFile = this.findFileByBasename(detailsFolder, detailSlug);
					if (detailFile) {
						return this.findParentIdea(detailFile);
					}
				}
			}
		}

		return null;
	}

	private findFileByBasename(folder: TFolder, basename: string): TFile | null {
		for (const child of folder.children) {
			if (child instanceof TFile && child.basename === basename) return child;
			if (child instanceof TFolder) {
				const found = this.findFileByBasename(child, basename);
				if (found) return found;
			}
		}
		return null;
	}
}
