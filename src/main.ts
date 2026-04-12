import { Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { AiJupyterSettings, DEFAULT_SETTINGS } from './settings-data';
import { AiJupyterSettingTab } from './settings';
import { ClaudeService } from './services/claude-service';
import { LinkService } from './services/link-service';
import { DiffService } from './services/diff-service';
import { TestService } from './services/test-service';
import { StatusService } from './services/status-service';
import { DashboardView, DASHBOARD_VIEW_TYPE } from './views/dashboard-view';
import { SidePanelView, SIDE_PANEL_VIEW_TYPE } from './views/side-panel-view';
import { BreadcrumbProcessor } from './views/breadcrumb-view';
import { StatusColorProcessor } from './views/status-color-processor';
import { resolveLoginEnv, clearEnvCache } from './utils/shell-env';

export default class AiJupyterPlugin extends Plugin {
	settings: AiJupyterSettings = DEFAULT_SETTINGS;

	private claudeService!: ClaudeService;
	private linkService!: LinkService;
	private diffService!: DiffService;
	private testService!: TestService;
	private statusService!: StatusService;
	private breadcrumbProcessor!: BreadcrumbProcessor;
	private statusColorProcessor!: StatusColorProcessor;

	// Debounce state for auto-link-on-save
	private autoLinkTimer: ReturnType<typeof setTimeout> | null = null;
	private autoLinkRunning = false;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Initialize services
		this.claudeService = new ClaudeService(this.settings);
		this.linkService = new LinkService(this.app, this.settings, this.claudeService);
		this.testService = new TestService(this.app, this.settings);
		this.statusService = new StatusService(this.app, this.settings, this.testService);
		this.diffService = new DiffService(this.app, this.settings);
		this.breadcrumbProcessor = new BreadcrumbProcessor(this.app, this.settings);
		this.statusColorProcessor = new StatusColorProcessor(this.app, this.settings, this.statusService);

		// Register views
		this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this.statusService));
		this.registerView(SIDE_PANEL_VIEW_TYPE, (leaf) => new SidePanelView(leaf, this.settings, this.statusService));

		// Register markdown post-processors
		this.registerMarkdownPostProcessor(this.breadcrumbProcessor.getProcessor());
		this.registerMarkdownPostProcessor(this.statusColorProcessor.getProcessor());

		// Register commands
		this.addCommand({
			id: 'link-keywords',
			name: 'Link Keywords - 识别关键语句并转化为链接',
			editorCallback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice('请先打开一个文档');
					return;
				}
				try {
					await this.linkService.linkKeywords(file);
					this.statusService.clearCache();
				} catch (e) {
					new Notice(`操作失败: ${(e as Error).message}`);
				}
			},
		});

		this.addCommand({
			id: 'generate-detail',
			name: 'Generate Detail - 为选中文本生成详细设计',
			editorCallback: async (editor) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice('请先打开一个文档');
					return;
				}
				const selection = editor.getSelection();
				if (!selection) {
					new Notice('请先选中需要生成详细设计的文本');
					return;
				}
				try {
					await this.linkService.generateDetailForSelection(file, selection);
					this.statusService.clearCache();
				} catch (e) {
					new Notice(`操作失败: ${(e as Error).message}`);
				}
			},
		});

		this.addCommand({
			id: 'record-diff',
			name: 'Record Diff - 记录当前 git diff',
			callback: async () => {
				try {
					await this.diffService.recordCurrentDiff();
				} catch (e) {
					new Notice(`操作失败: ${(e as Error).message}`);
				}
			},
		});

		this.addCommand({
			id: 'run-tests',
			name: 'Run Tests - 执行关联用例并更新状态',
			callback: async () => {
				try {
					await this.testService.runTests();
					this.statusService.clearCache();
					await this.refreshViews();
				} catch (e) {
					new Notice(`操作失败: ${(e as Error).message}`);
				}
			},
		});

		this.addCommand({
			id: 'refresh-status',
			name: 'Refresh Status - 刷新所有文档的用例状态',
			callback: async () => {
				try {
					await this.statusService.refreshAll();
					await this.refreshViews();
					new Notice('状态已刷新');
				} catch (e) {
					new Notice(`操作失败: ${(e as Error).message}`);
				}
			},
		});

		this.addCommand({
			id: 'open-dashboard',
			name: 'Open Dashboard - 打开想法状态仪表盘',
			callback: async () => {
				await this.activateDashboard();
			},
		});

		this.addCommand({
			id: 'open-side-panel',
			name: 'Open Side Panel - 打开侧边栏概览',
			callback: async () => {
				await this.activateSidePanel();
			},
		});

		this.addCommand({
			id: 'sync-all',
			name: 'Sync All - 全量同步',
			callback: async () => {
				try {
					new Notice('开始全量同步...');

					// 1. Link keywords in all idea documents
					const ideasFolder = this.app.vault.getAbstractFileByPath(this.settings.ideasFolder);
					if (ideasFolder) {
						const children = (ideasFolder as { children?: unknown[] }).children;
						if (Array.isArray(children)) {
							for (const child of children) {
								if (child instanceof TFile && child.extension === 'md') {
									await this.linkService.linkKeywords(child);
								}
							}
						}
					}

					// 2. Record diff
					await this.diffService.recordCurrentDiff();

					// 3. Run tests
					if (this.settings.autoRunTests) {
						await this.testService.runTests();
					}

					// 4. Refresh status
					await this.statusService.refreshAll();
					await this.refreshViews();

					new Notice('全量同步完成');
				} catch (e) {
					new Notice(`同步失败: ${(e as Error).message}`);
				}
			},
		});

		// Settings tab
		this.addSettingTab(new AiJupyterSettingTab(this.app, this));

		// Auto-link on save (debounced — waits 2s after last modify, skips if already running)
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (!this.settings.autoLinkOnSave) return;
				if (!(file instanceof TFile)) return;
				if (!file.path.startsWith(this.settings.ideasFolder + '/')) return;

				// Debounce: restart timer on each modify, only fire after 2s idle
				if (this.autoLinkTimer) {
					clearTimeout(this.autoLinkTimer);
				}
				this.autoLinkTimer = setTimeout(async () => {
					this.autoLinkTimer = null;
					if (this.autoLinkRunning) return; // Skip if a previous run is still in progress
					this.autoLinkRunning = true;
					try {
						await this.linkService.linkKeywords(file);
						this.statusService.clearCache();
					} catch (e) {
						new Notice(`自动链接失败: ${(e as Error).message}`);
					} finally {
						this.autoLinkRunning = false;
					}
				}, 2000);
			})
		);

		// Start diff tracking if enabled
		if (this.settings.autoTrackDiffs) {
			this.app.workspace.onLayoutReady(() => {
				this.diffService.startTracking();
			});
		}

		// Pre-compute statuses on layout ready
		this.app.workspace.onLayoutReady(async () => {
			// Pre-warm login shell environment so first command doesn't lag
			resolveLoginEnv(this.settings.shell).then(() => {
				console.log('AiJupyter: login shell environment resolved');
			});

			await this.statusService.refreshAll();

			// Open side panel if configured
			if (this.settings.showSidePanel) {
				await this.activateSidePanel();
			}
		});

		// Add ribbon icon
		this.addRibbonIcon('brain-circuit', 'AiJupyter 仪表盘', () => {
			this.activateDashboard();
		});
	}

	async onunload(): Promise<void> {
		this.diffService.stopTracking();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);

		// Clear env cache so next exec picks up new shell / extraPath
		clearEnvCache();

		// Propagate settings changes to services
		this.claudeService.updateSettings(this.settings);
		this.linkService.updateSettings(this.settings);
		this.diffService.updateSettings(this.settings);
		this.testService.updateSettings(this.settings);
		this.statusService.updateSettings(this.settings);
		this.breadcrumbProcessor.updateSettings(this.settings);
		this.statusColorProcessor.updateSettings(this.settings);

		// Update side panel settings
		const sidePanelLeaves = this.app.workspace.getLeavesOfType(SIDE_PANEL_VIEW_TYPE);
		for (const leaf of sidePanelLeaves) {
			(leaf.view as SidePanelView).updateSettings(this.settings);
		}
	}

	private async activateDashboard(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
		if (existing.length) {
			this.app.workspace.revealLeaf(existing[0]);
			(existing[0].view as DashboardView).refresh();
			return;
		}

		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	private async activateSidePanel(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(SIDE_PANEL_VIEW_TYPE);
		if (existing.length) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: SIDE_PANEL_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	private async refreshViews(): Promise<void> {
		const dashboardLeaves = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
		for (const leaf of dashboardLeaves) {
			await (leaf.view as DashboardView).refresh();
		}

		const sidePanelLeaves = this.app.workspace.getLeavesOfType(SIDE_PANEL_VIEW_TYPE);
		for (const leaf of sidePanelLeaves) {
			await (leaf.view as SidePanelView).refresh();
		}
	}
}
