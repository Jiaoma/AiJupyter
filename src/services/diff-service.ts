import { App, TFile, TFolder, Notice } from 'obsidian';
import type { AiJupyterSettings } from '../settings-data';
import { getLatestCommitHash, getCommitDiff, getRepoRoot } from '../utils/git';
import { renderDiffTemplate } from '../utils/template';
import { OperationLogger } from '../utils/logger';

export class DiffService {
	private app: App;
	private settings: AiJupyterSettings;
	private lastKnownCommit: string | null = null;
	private pollInterval: ReturnType<typeof setInterval> | null = null;

	constructor(app: App, settings: AiJupyterSettings) {
		this.app = app;
		this.settings = settings;
	}

	updateSettings(settings: AiJupyterSettings): void {
		this.settings = settings;
	}

	async startTracking(): Promise<void> {
		const repoRoot = await this.getRepoRoot();
		if (!repoRoot) return;

		try {
			this.lastKnownCommit = await getLatestCommitHash(repoRoot, this.settings.shell, this.settings.extraPath);
		} catch {
			// Not in a git repo or no commits yet
			return;
		}

		// Poll every 30 seconds for new commits
		this.pollInterval = setInterval(() => this.checkForNewCommits(), 30000);
	}

	stopTracking(): void {
		if (this.pollInterval) {
			clearInterval(this.pollInterval);
			this.pollInterval = null;
		}
	}

	async recordCurrentDiff(): Promise<void> {
		const repoRoot = await this.getRepoRoot();
		if (!repoRoot) {
			new Notice('未找到 git 仓库');
			return;
		}

		const logger = new OperationLogger(this.app, this.settings.logsFolder, '记录 Git Diff');
		try {
			const commitHash = await getLatestCommitHash(repoRoot, this.settings.shell, this.settings.extraPath);
			logger.info(`获取最新 commit：${commitHash.slice(0, 7)}`);
			await this.recordCommitDiff(repoRoot, commitHash, logger);
			await logger.flush();
			new Notice('已记录最新 commit 的 diff');
		} catch (e) {
			logger.error(`记录 diff 失败：${(e as Error).message}`);
			await logger.flush();
			new Notice(`记录 diff 失败: ${(e as Error).message}`);
		}
	}

	private async checkForNewCommits(): Promise<void> {
		const repoRoot = await this.getRepoRoot();
		if (!repoRoot) return;

		try {
			const currentCommit = await getLatestCommitHash(repoRoot, this.settings.shell, this.settings.extraPath);
			if (currentCommit !== this.lastKnownCommit) {
				this.lastKnownCommit = currentCommit;
				const logger = new OperationLogger(this.app, this.settings.logsFolder, '自动记录 Git Diff');
				logger.info(`检测到新 commit：${currentCommit.slice(0, 7)}`);
				await this.recordCommitDiff(repoRoot, currentCommit, logger);
				await logger.flush();
			}
		} catch {
			// Silently ignore polling errors
		}
	}

	private async recordCommitDiff(repoRoot: string, commitHash: string, logger?: OperationLogger): Promise<void> {
		const result = await getCommitDiff(repoRoot, commitHash, this.settings.shell, this.settings.extraPath);
		logger?.info(`commit 信息：${result.message.split('\n')[0]}`);
		logger?.info(`变更文件数：${result.files.length}`);
		for (const f of result.files) {
			logger?.info(`  ${f.changeType}  ${f.path}`);
		}

		// Try to match to a detail document based on commit message or changed files
		const detailSlug = this.matchToDetail(result.message, result.files.map((f) => f.path));
		if (!detailSlug) {
			logger?.warn('未匹配到详细设计文档，记录为 unlinked');
			await this.createDiffDoc('unlinked', 'unlinked', commitHash, result, logger);
			return;
		}

		logger?.success(`匹配到详细设计文档：${detailSlug.subfolder}/${detailSlug.slug}`);
		await this.createDiffDoc(detailSlug.subfolder, detailSlug.slug, commitHash, result, logger);
	}

	private async createDiffDoc(
		subfolder: string,
		detailFileName: string,
		commitHash: string,
		result: { commit: string; message: string; files: { path: string; changeType: string }[]; diff: string },
		logger?: OperationLogger
	): Promise<void> {
		// Find next available diff number
		const diffFolder = `${this.settings.diffsFolder}/${subfolder}`;
		let index = 1;
		while (
			this.app.vault.getAbstractFileByPath(
				`${diffFolder}/${detailFileName}-diff-${String(index).padStart(3, '0')}.md`
			)
		) {
			index++;
		}

		const diffPath = `${diffFolder}/${detailFileName}-diff-${String(index).padStart(3, '0')}.md`;

		const content = renderDiffTemplate({
			detailFileName,
			title: detailFileName,
			commit: commitHash.slice(0, 7),
			description: result.message.split('\n')[0],
			changedFiles: result.files as { path: string; changeType: 'added' | 'modified' | 'deleted' | 'renamed' }[],
			diffContent: result.diff,
		});

		await this.ensureFolder(diffFolder);
		await this.app.vault.create(diffPath, content);
		logger?.success(`创建 diff 文档：${diffPath}`);

		// Update the related detail document's diff table
		await this.updateDetailDiffTable(subfolder, detailFileName, index, commitHash, result.message);
		logger?.info(`已更新详细设计文档的 diff 表格`);
	}

	private async updateDetailDiffTable(
		subfolder: string,
		detailFileName: string,
		diffIndex: number,
		commitHash: string,
		message: string
	): Promise<void> {
		const detailPath = `${this.settings.detailsFolder}/${subfolder}/${detailFileName}.md`;
		const file = this.app.vault.getAbstractFileByPath(detailPath);
		if (!(file instanceof TFile)) return;

		const content = await this.app.vault.read(file);
		const diffNum = String(diffIndex).padStart(3, '0');
		const diffLink = `${detailFileName}-diff-${diffNum}`;
		const today = new Date().toISOString().split('T')[0];
		const desc = message.split('\n')[0].slice(0, 50);

		const newRow = `| ${diffIndex} | ${desc} | ${today} | [[${diffLink}]] |`;

		// Insert the row before the empty line after the diff table header
		const tableMarker = '## 关联 Diff';
		const markerIdx = content.indexOf(tableMarker);
		if (markerIdx === -1) return;

		// Find the end of the table (next ## or end of doc)
		const afterMarker = content.slice(markerIdx);
		const nextSectionIdx = afterMarker.indexOf('\n## ', tableMarker.length);
		const tableEnd = nextSectionIdx === -1
			? content.length
			: markerIdx + nextSectionIdx;

		// Insert new row at the end of the table section
		const before = content.slice(0, tableEnd).trimEnd();
		const after = content.slice(tableEnd);
		const updated = `${before}\n${newRow}\n${after}`;

		await this.app.vault.modify(file, updated);
	}

	private matchToDetail(
		commitMessage: string,
		changedFiles: string[]
	): { subfolder: string; slug: string } | null {
		// Search all detail documents and try to match
		const detailsFolder = this.app.vault.getAbstractFileByPath(this.settings.detailsFolder);
		if (!(detailsFolder instanceof TFolder)) return null;

		const messageLower = commitMessage.toLowerCase();

		const allDetails = this.getAllDetailFiles(detailsFolder);
		for (const detail of allDetails) {
			const slug = detail.basename;
			const subfolder = detail.parent?.name || '';
			// Match if commit message contains the slug (with or without dashes)
			const slugWords = slug.replace(/-/g, ' ');
			if (messageLower.includes(slug) || messageLower.includes(slugWords)) {
				return { subfolder, slug };
			}
		}

		return null;
	}

	private getAllDetailFiles(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				files.push(child);
			} else if (child instanceof TFolder) {
				files.push(...this.getAllDetailFiles(child));
			}
		}
		return files;
	}

	private async getRepoRoot(): Promise<string | null> {
		// Use the vault's adapter basePath as working directory
		const basePath = (this.app.vault.adapter as { basePath?: string }).basePath;
		if (!basePath) return null;
		return getRepoRoot(basePath, this.settings.shell, this.settings.extraPath);
	}

	private async ensureFolder(path: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFolder) return;

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
}
