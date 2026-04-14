import { App, Notice, TFolder, WorkspaceLeaf } from 'obsidian';
import type { AiJupyterSettings } from '../settings-data';
import { renderOverviewTemplate } from '../utils/template';
import { ProgressIndicator } from '../views/progress-indicator';
import { OperationLogger } from '../utils/logger';
import type { ClaudeService } from './claude-service';
import { ChatPanelView, CHAT_PANEL_VIEW_TYPE } from '../views/chat-panel-view';

const PROMPTS = {
	requirements: (overview: string) =>
		`你是一个资深需求分析师。根据以下项目概览文档，生成一份详细的需求文档。

要求：
- 使用 REQ-ID 编号（REQ-001, REQ-002, ...）
- 每个需求包含：描述、输入、输出、业务规则、验收标准、依赖
- 区分功能需求和非功能需求（NFR）
- 优先级标注（P0/P1/P2）
- 输出纯 Markdown 格式，不要包含 frontmatter

项目概览：
${overview}`,

	reqImplMapping: (overview: string, requirements: string) =>
		`你是一个技术架构师。根据以下项目概览和需求文档，生成一份需求-实现追踪矩阵。

要求：
- 每个 REQ-ID 对应实现文档链接、实现状态、测试状态
- 包含覆盖率统计
- 输出纯 Markdown 格式，不要包含 frontmatter

项目概览：
${overview}

需求文档：
${requirements}`,

	testCases: (requirements: string) =>
		`你是一个测试工程师。根据以下需求文档，生成全面的测试用例文档。

要求：
- 使用 TC-ID 编号（TC-001, TC-002, ...）
- 每个用例关联 REQ-ID
- 包含：类型（正常/边界/异常）、前置条件、步骤、期望结果
- 输出纯 Markdown 格式，不要包含 frontmatter

需求文档：
${requirements}`,

	changelog: (overview: string) =>
		`你是一个项目经理。根据以下项目概览，生成一份初始变更日志。

要求：
- 使用 Keep a Changelog 格式
- 包含 [Unreleased] 部分
- 根据概览中的功能点列出初始的"新增"条目
- 输出纯 Markdown 格式，不要包含 frontmatter

项目概览：
${overview}`,
};

export class ScaffoldService {
	private app: App;
	private settings: AiJupyterSettings;
	private claudeService: ClaudeService;

	constructor(app: App, settings: AiJupyterSettings, claudeService: ClaudeService) {
		this.app = app;
		this.settings = settings;
		this.claudeService = claudeService;
	}

	updateSettings(settings: AiJupyterSettings): void {
		this.settings = settings;
	}

	/**
	 * Create only the overview.md scaffold + ensure directories exist.
	 */
	async createScaffold(): Promise<void> {
		const logger = new OperationLogger(this.app, this.settings.logsFolder, '创建需求文档脚手架');
		const progress = new ProgressIndicator();
		progress.show('创建脚手架');

		logger.info('开始创建需求文档脚手架');

		try {
			// Ensure all directories exist
			const dirs = [
				this.settings.ideasFolder,
				this.settings.detailsFolder,
				this.settings.diffsFolder,
				this.settings.testsFolder,
				this.settings.logsFolder,
			];
			for (const dir of dirs) {
				await this.ensureFolder(dir);
				logger.info(`确保目录存在：${dir}`);
			}

			const overviewPath = `${this.settings.ideasFolder}/overview.md`;
			progress.setDeterminate('正在创建 overview.md...');

			if (this.app.vault.getAbstractFileByPath(overviewPath)) {
				logger.warn(`跳过（已存在）：${overviewPath}`);
				progress.update(1, 1, '脚手架创建完成');
				const logPath = await logger.flush();
				progress.dismiss();
				new Notice(`overview.md 已存在，跳过创建${logPath ? `\n日志：${logPath}` : ''}`);
				return;
			}

			const content = renderOverviewTemplate();
			await this.app.vault.create(overviewPath, content);
			logger.success(`创建文档：${overviewPath}`);

			progress.update(1, 1, '脚手架创建完成');
			logger.success('脚手架创建完成：overview.md 已创建，请填写后使用生成命令');

			const logPath = await logger.flush();
			progress.dismiss();
			new Notice(`overview.md 已创建！请填写后使用 Generate 命令逐步生成其他文档${logPath ? `\n日志：${logPath}` : ''}`);
		} catch (e) {
			logger.error(`脚手架创建失败：${(e as Error).message}`);
			await logger.flush();
			progress.dismiss();
			throw e;
		}
	}

	async generateRequirements(): Promise<void> {
		const overview = await this.readFileContent(`${this.settings.ideasFolder}/overview.md`);
		if (!overview) {
			new Notice('请先创建并填写 overview.md');
			return;
		}

		const prompt = PROMPTS.requirements(overview);
		const targetPath = `${this.settings.ideasFolder}/requirements.md`;

		await this.openChatAndGenerate('生成需求文档', targetPath, prompt);
	}

	async generateReqImplMapping(): Promise<void> {
		const overview = await this.readFileContent(`${this.settings.ideasFolder}/overview.md`);
		const requirements = await this.readFileContent(`${this.settings.ideasFolder}/requirements.md`);
		if (!overview || !requirements) {
			new Notice('请先确保 overview.md 和 requirements.md 已存在');
			return;
		}

		const prompt = PROMPTS.reqImplMapping(overview, requirements);
		const targetPath = `${this.settings.ideasFolder}/req-impl-mapping.md`;

		await this.openChatAndGenerate('生成需求追踪矩阵', targetPath, prompt);
	}

	async generateTestCases(): Promise<void> {
		const requirements = await this.readFileContent(`${this.settings.ideasFolder}/requirements.md`);
		if (!requirements) {
			new Notice('请先确保 requirements.md 已存在');
			return;
		}

		const prompt = PROMPTS.testCases(requirements);
		const targetPath = `${this.settings.ideasFolder}/test-cases.md`;

		await this.openChatAndGenerate('生成测试用例', targetPath, prompt);
	}

	async generateChangelog(): Promise<void> {
		const overview = await this.readFileContent(`${this.settings.ideasFolder}/overview.md`);
		if (!overview) {
			new Notice('请先确保 overview.md 已存在');
			return;
		}

		const prompt = PROMPTS.changelog(overview);
		const targetPath = `${this.settings.ideasFolder}/changelog.md`;

		await this.openChatAndGenerate('生成变更日志', targetPath, prompt);
	}

	private async openChatAndGenerate(title: string, targetPath: string, prompt: string): Promise<void> {
		const chatPanel = await this.activateChatPanel();
		if (!chatPanel) {
			new Notice('无法打开对话面板');
			return;
		}

		chatPanel.startGeneration({
			title,
			targetPath,
			initialPrompt: prompt,
			onConfirm: async (content: string) => {
				await this.writeDocument(targetPath, content);
				new Notice(`${title}完成：${targetPath}`);
			},
		});
	}

	private async activateChatPanel(): Promise<ChatPanelView | null> {
		const existing = this.app.workspace.getLeavesOfType(CHAT_PANEL_VIEW_TYPE);
		if (existing.length) {
			this.app.workspace.revealLeaf(existing[0]);
			return existing[0].view as ChatPanelView;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return null;

		await leaf.setViewState({ type: CHAT_PANEL_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
		return leaf.view as ChatPanelView;
	}

	private async readFileContent(path: string): Promise<string | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file) return null;
		return this.app.vault.read(file as import('obsidian').TFile);
	}

	private async writeDocument(path: string, content: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing) {
			await this.app.vault.modify(existing as import('obsidian').TFile, content);
		} else {
			await this.app.vault.create(path, content);
		}
	}

	private async ensureFolder(path: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFolder) return;

		const parts = path.split('/');
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				await this.app.vault.createFolder(current);
			}
		}
	}
}
