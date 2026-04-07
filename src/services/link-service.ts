import { App, TFile, TFolder, Notice } from 'obsidian';
import type { AiJupyterSettings } from '../settings-data';
import type { ClaudeService } from './claude-service';
import type { AnalyzedKeyword } from '../models/idea';
import { renderDetailTemplate, renderTestTemplate } from '../utils/template';

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

		new Notice('正在调用 Claude 分析关键语句...');
		const result = await this.claudeService.analyzeIdea(bodyContent);

		if (!result.keywords.length) {
			new Notice('未识别到关键语句');
			return 0;
		}

		// Derive the idea name from file basename (e.g., "idea-auth-system" from "idea-auth-system.md")
		const ideaName = file.basename;
		const ideaSubfolder = ideaName.replace(/^idea-/, '');

		// Create linked content
		let linkedContent = content;
		for (const kw of result.keywords) {
			// Only replace if not already linked
			if (linkedContent.includes(`[[${kw.slug}|`)) continue;

			linkedContent = linkedContent.replace(
				kw.original,
				`[[${kw.slug}|${kw.displayText}]]`
			);
		}

		// Update the idea document
		await this.app.vault.modify(file, linkedContent);

		// Generate sub-documents
		await this.generateSubDocuments(ideaName, ideaSubfolder, result.keywords);

		new Notice(`已识别 ${result.keywords.length} 个关键语句并生成子文档`);
		return result.keywords.length;
	}

	async generateDetailForSelection(
		file: TFile,
		selectedText: string
	): Promise<void> {
		const ideaName = file.basename;
		const ideaSubfolder = ideaName.replace(/^idea-/, '');

		new Notice('正在为选中文本生成详细设计...');
		const result = await this.claudeService.analyzeIdea(selectedText);

		if (!result.keywords.length) {
			new Notice('未能生成详细设计');
			return;
		}

		await this.generateSubDocuments(ideaName, ideaSubfolder, result.keywords);

		// Insert links in the original document
		let content = await this.app.vault.read(file);
		for (const kw of result.keywords) {
			if (content.includes(`[[${kw.slug}|`)) continue;
			content = content.replace(
				kw.original,
				`[[${kw.slug}|${kw.displayText}]]`
			);
		}
		await this.app.vault.modify(file, content);

		new Notice(`已生成 ${result.keywords.length} 个详细设计文档`);
	}

	private async generateSubDocuments(
		ideaName: string,
		subfolder: string,
		keywords: AnalyzedKeyword[]
	): Promise<void> {
		for (const kw of keywords) {
			await this.createDetailDoc(ideaName, subfolder, kw);
			await this.createTestDoc(subfolder, kw);
		}
	}

	private async createDetailDoc(
		ideaName: string,
		subfolder: string,
		kw: AnalyzedKeyword
	): Promise<void> {
		const detailPath = `${this.settings.detailsFolder}/${subfolder}/${kw.slug}.md`;

		// Don't overwrite existing documents
		if (this.app.vault.getAbstractFileByPath(detailPath)) return;

		const content = renderDetailTemplate({
			ideaFileName: ideaName,
			title: kw.displayText,
			sourceQuote: kw.original,
			implementation: kw.detailContent,
		});

		await this.ensureFolder(`${this.settings.detailsFolder}/${subfolder}`);
		await this.app.vault.create(detailPath, content);
	}

	private async createTestDoc(
		subfolder: string,
		kw: AnalyzedKeyword
	): Promise<void> {
		const testPath = `${this.settings.testsFolder}/${subfolder}/${kw.slug}-tests.md`;

		if (this.app.vault.getAbstractFileByPath(testPath)) return;

		const content = renderTestTemplate({
			detailFileName: kw.slug,
			title: kw.displayText,
			testCases: kw.testCases,
		});

		await this.ensureFolder(`${this.settings.testsFolder}/${subfolder}`);
		await this.app.vault.create(testPath, content);
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
