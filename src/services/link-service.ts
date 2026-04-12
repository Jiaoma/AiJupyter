import { App, TFile, TFolder, Notice } from 'obsidian';
import type { AiJupyterSettings } from '../settings-data';
import type { ClaudeService } from './claude-service';
import type { AnalyzedKeyword } from '../models/idea';
import { renderDetailTemplate, renderTestTemplate } from '../utils/template';
import { ProgressIndicator } from '../views/progress-indicator';
import { OperationLogger } from '../utils/logger';

export class LinkService {
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

	async linkKeywords(file: TFile): Promise<number> {
		const content = await this.app.vault.read(file);

		// Strip existing frontmatter before sending to Claude
		const bodyContent = this.stripFrontmatter(content);
		if (!bodyContent.trim()) {
			new Notice('文档内容为空');
			return 0;
		}

		const logger = new OperationLogger(this.app, this.settings.logsFolder, `识别关键语句 - ${file.basename}`);
		const progress = new ProgressIndicator();
		progress.show('文档生成中');
		progress.setIndeterminate('正在调用 Claude 分析关键语句...');
		logger.info(`开始分析文档：${file.path}`);

		try {
			const result = await this.claudeService.analyzeIdea(bodyContent);
			logger.info(`Claude 分析完成，识别到 ${result.keywords.length} 个关键语句`);

			if (!result.keywords.length) {
				logger.warn('未识别到关键语句，操作终止');
				await logger.flush();
				progress.dismiss();
				new Notice('未识别到关键语句');
				return 0;
			}

			// Derive the idea name from file basename
			const ideaName = file.basename;
			const ideaSubfolder = ideaName.replace(/^idea-/, '');

			// Create linked content
			progress.setDeterminate('正在插入链接...');
			logger.info('开始将关键语句转为 wiki 链接');
			let linkedContent = content;
			for (const kw of result.keywords) {
				if (linkedContent.includes(`[[${kw.slug}|`)) {
					logger.info(`跳过（已存在链接）：${kw.slug}`);
					continue;
				}
				linkedContent = linkedContent.replace(
					kw.original,
					`[[${kw.slug}|${kw.displayText}]]`
				);
				logger.success(`插入链接：[[${kw.slug}|${kw.displayText}]]`);
			}

			// Update the idea document
			await this.app.vault.modify(file, linkedContent);
			logger.info(`已更新想法文档：${file.path}`);

			// Generate sub-documents with progress tracking
			await this.generateSubDocuments(ideaName, ideaSubfolder, result.keywords, progress, logger);

			const logPath = await logger.flush();
			progress.dismiss();
			new Notice(`已识别 ${result.keywords.length} 个关键语句并生成子文档${logPath ? `，日志：${logPath}` : ''}`);
			return result.keywords.length;
		} catch (e) {
			logger.error(`操作失败：${(e as Error).message}`);
			await logger.flush();
			progress.dismiss();
			throw e;
		}
	}

	async generateDetailForSelection(
		file: TFile,
		selectedText: string
	): Promise<void> {
		const ideaName = file.basename;
		const ideaSubfolder = ideaName.replace(/^idea-/, '');

		const logger = new OperationLogger(this.app, this.settings.logsFolder, `生成详细设计 - ${ideaName}`);
		const progress = new ProgressIndicator();
		progress.show('文档生成中');
		progress.setIndeterminate('正在为选中文本生成详细设计...');
		logger.info(`开始为选中文本生成详细设计，来源文档：${file.path}`);
		logger.info(`选中文本（前100字）：${selectedText.slice(0, 100)}${selectedText.length > 100 ? '...' : ''}`);

		try {
			const result = await this.claudeService.analyzeIdea(selectedText);
			logger.info(`Claude 分析完成，生成 ${result.keywords.length} 个关键语句`);

			if (!result.keywords.length) {
				logger.warn('未能生成详细设计');
				await logger.flush();
				progress.dismiss();
				new Notice('未能生成详细设计');
				return;
			}

			await this.generateSubDocuments(ideaName, ideaSubfolder, result.keywords, progress, logger);

			// Insert links in the original document
			progress.setDeterminate('正在插入链接...');
			progress.update(0, 1);
			logger.info('开始将关键语句插入源文档');
			let content = await this.app.vault.read(file);
			for (const kw of result.keywords) {
				if (content.includes(`[[${kw.slug}|`)) {
					logger.info(`跳过（已存在链接）：${kw.slug}`);
					continue;
				}
				content = content.replace(
					kw.original,
					`[[${kw.slug}|${kw.displayText}]]`
				);
				logger.success(`插入链接：[[${kw.slug}|${kw.displayText}]]`);
			}
			await this.app.vault.modify(file, content);
			progress.update(1, 1);
			logger.info(`已更新源文档：${file.path}`);

			const logPath = await logger.flush();
			progress.dismiss();
			new Notice(`已生成 ${result.keywords.length} 个详细设计文档${logPath ? `，日志：${logPath}` : ''}`);
		} catch (e) {
			logger.error(`操作失败：${(e as Error).message}`);
			await logger.flush();
			progress.dismiss();
			throw e;
		}
	}

	private async generateSubDocuments(
		ideaName: string,
		subfolder: string,
		keywords: AnalyzedKeyword[],
		progress?: ProgressIndicator,
		logger?: OperationLogger
	): Promise<void> {
		const total = keywords.length;
		if (progress) {
			progress.setDeterminate('正在生成子文档...');
		}
		logger?.info(`开始生成子文档，共 ${total} 个关键语句`);

		for (let i = 0; i < total; i++) {
			const kw = keywords[i];
			if (progress) {
				progress.update(i, total, `正在生成：${kw.displayText}`);
			}
			await this.createDetailDoc(ideaName, subfolder, kw, logger);
			await this.createTestDoc(subfolder, kw, logger);
		}

		if (progress) {
			progress.update(total, total, '子文档生成完成');
		}
		logger?.success(`子文档生成完成，共处理 ${total} 个关键语句`);
	}

	private async createDetailDoc(
		ideaName: string,
		subfolder: string,
		kw: AnalyzedKeyword,
		logger?: OperationLogger
	): Promise<void> {
		const detailPath = `${this.settings.detailsFolder}/${subfolder}/${kw.slug}.md`;

		// Don't overwrite existing documents
		if (this.app.vault.getAbstractFileByPath(detailPath)) {
			logger?.info(`跳过（已存在）：${detailPath}`);
			return;
		}

		const content = renderDetailTemplate({
			ideaFileName: ideaName,
			title: kw.displayText,
			sourceQuote: kw.original,
			implementation: kw.detailContent,
		});

		await this.ensureFolder(`${this.settings.detailsFolder}/${subfolder}`);
		await this.app.vault.create(detailPath, content);
		logger?.success(`创建详细设计文档：${detailPath}`);
	}

	private async createTestDoc(
		subfolder: string,
		kw: AnalyzedKeyword,
		logger?: OperationLogger
	): Promise<void> {
		const testPath = `${this.settings.testsFolder}/${subfolder}/${kw.slug}-tests.md`;

		if (this.app.vault.getAbstractFileByPath(testPath)) {
			logger?.info(`跳过（已存在）：${testPath}`);
			return;
		}

		const content = renderTestTemplate({
			detailFileName: kw.slug,
			title: kw.displayText,
			testCases: kw.testCases,
		});

		await this.ensureFolder(`${this.settings.testsFolder}/${subfolder}`);
		await this.app.vault.create(testPath, content);
		logger?.success(`创建测试用例文档：${testPath}`);
	}

	private async ensureFolder(path: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFolder) return;

		// Create nested folders
		const parts = path.split('/');
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			const folder = this.app.vault.getAbstractFileByPath(current);
			if (!folder) {
				await this.app.vault.createFolder(current);
			}
		}
	}

	private stripFrontmatter(content: string): string {
		const match = content.match(/^---\n[\s\S]*?\n---\n/);
		if (match) {
			return content.slice(match[0].length);
		}
		return content;
	}
}
