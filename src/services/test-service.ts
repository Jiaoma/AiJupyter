import { App, TFile, TFolder, Notice } from 'obsidian';
import type { AiJupyterSettings } from '../settings-data';
import type { TestStatus } from '../models/test-case';
import { today } from '../utils/frontmatter';
import { shellExec } from '../utils/shell-env';
import { OperationLogger } from '../utils/logger';

export class TestService {
	private app: App;
	private settings: AiJupyterSettings;

	constructor(app: App, settings: AiJupyterSettings) {
		this.app = app;
		this.settings = settings;
	}

	updateSettings(settings: AiJupyterSettings): void {
		this.settings = settings;
	}

	async runTests(): Promise<void> {
		const basePath = (this.app.vault.adapter as { basePath?: string }).basePath;
		if (!basePath) {
			new Notice('无法获取 vault 路径');
			return;
		}

		new Notice('正在执行测试...');
		const logger = new OperationLogger(this.app, this.settings.logsFolder, '执行测试用例');
		logger.info(`执行测试命令：${this.settings.testCommand}`);
		logger.info(`工作目录：${basePath}`);

		try {
			const output = await this.executeTestCommand(basePath);
			logger.info('测试命令执行完成');
			const updatedCount = await this.parseAndUpdateResults(output, logger);
			logger.success(`共更新 ${updatedCount} 个用例状态`);
			await logger.flush();
			new Notice('测试执行完成，已更新用例状态');
		} catch (e) {
			// Test command failure might mean tests failed — still parse output
			const err = e as { stdout?: string; stderr?: string; message?: string };
			const output = (err.stdout || '') + '\n' + (err.stderr || '');
			if (output.trim()) {
				logger.warn(`测试命令以非零退出，尝试解析输出`);
				const updatedCount = await this.parseAndUpdateResults(output, logger);
				logger.warn(`共更新 ${updatedCount} 个用例状态（部分失败）`);
				await logger.flush();
				new Notice('部分测试失败，已更新用例状态');
			} else {
				logger.error(`测试执行失败：${err.message || '未知错误'}`);
				await logger.flush();
				new Notice(`测试执行失败: ${err.message || '未知错误'}`);
			}
		}
	}

	async getTestStatusForDetail(detailSlug: string): Promise<TestStatus[]> {
		const testsFolder = this.app.vault.getAbstractFileByPath(this.settings.testsFolder);
		if (!(testsFolder instanceof TFolder)) return [];

		const testFiles = this.findTestFilesForDetail(testsFolder, detailSlug);
		const statuses: TestStatus[] = [];

		for (const file of testFiles) {
			const content = await this.app.vault.read(file);
			const tableStatuses = this.parseTestTable(content);
			statuses.push(...tableStatuses);
		}

		return statuses;
	}

	async getAllTestStatuses(): Promise<Map<string, TestStatus[]>> {
		const result = new Map<string, TestStatus[]>();
		const testsFolder = this.app.vault.getAbstractFileByPath(this.settings.testsFolder);
		if (!(testsFolder instanceof TFolder)) return result;

		const allTestFiles = this.getAllTestFiles(testsFolder);
		for (const file of allTestFiles) {
			const content = await this.app.vault.read(file);
			// Extract detail link from frontmatter
			const detailMatch = content.match(/detail:\s*"?\[\[([^\]]+)\]\]"?/);
			if (detailMatch) {
				const detailSlug = detailMatch[1];
				const statuses = this.parseTestTable(content);
				const existing = result.get(detailSlug) || [];
				result.set(detailSlug, [...existing, ...statuses]);
			}
		}

		return result;
	}

	private parseTestTable(content: string): TestStatus[] {
		const statuses: TestStatus[] = [];
		// Match table rows: | # | name | input | expected | actual | STATUS | date |
		const rowRegex = /\|\s*\d+\s*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|\s*(pass|fail|pending)\s*\|/gi;
		let match;
		while ((match = rowRegex.exec(content)) !== null) {
			statuses.push(match[1].toLowerCase() as TestStatus);
		}
		return statuses;
	}

	private async executeTestCommand(cwd: string): Promise<string> {
		const { stdout, stderr } = await shellExec(
			this.settings.testCommand,
			this.settings.shell,
			this.settings.extraPath,
			{ cwd, timeout: 300000 }
		);
		return stdout + '\n' + stderr;
	}

	private async parseAndUpdateResults(output: string, logger?: OperationLogger): Promise<number> {
		// Find all test files and update their status based on output
		const testsFolder = this.app.vault.getAbstractFileByPath(this.settings.testsFolder);
		if (!(testsFolder instanceof TFolder)) return 0;

		const allTestFiles = this.getAllTestFiles(testsFolder);
		const dateStr = today();
		let totalUpdated = 0;

		logger?.info(`扫描测试文件数：${allTestFiles.length}`);

		for (const file of allTestFiles) {
			let content = await this.app.vault.read(file);
			let modified = false;

			// Update pending tests to pass/fail based on output matching
			// This is a heuristic — try to match test case names in the output
			const rowRegex = /(\|\s*\d+\s*\|)\s*([^|]*)\s*(\|[^|]*\|[^|]*\|)\s*[^|]*\s*\|\s*(pass|fail|pending)\s*\|\s*[^|]*\s*\|/gi;
			content = content.replace(rowRegex, (fullMatch, num, testName, middle, currentStatus) => {
				const name = testName.trim().toLowerCase();
				const outputLower = output.toLowerCase();

				// Determine if this test passed or failed from output
				let newStatus: TestStatus = currentStatus as TestStatus;
				if (outputLower.includes(name)) {
					// Check if the context around the name indicates pass or fail
					const nameIdx = outputLower.indexOf(name);
					const context = outputLower.slice(
						Math.max(0, nameIdx - 50),
						Math.min(outputLower.length, nameIdx + name.length + 50)
					);
					if (context.includes('pass') || context.includes('✓') || context.includes('success')) {
						newStatus = 'pass';
					} else if (context.includes('fail') || context.includes('✗') || context.includes('error')) {
						newStatus = 'fail';
					}
				}

				if (newStatus !== currentStatus) {
					modified = true;
					totalUpdated++;
					logger?.info(`${file.basename}：${testName.trim()} ${currentStatus} → ${newStatus}`);
					return `${num} ${testName}${middle} — | ${newStatus} | ${dateStr} |`;
				}
				return fullMatch;
			});

			if (modified) {
				// Update the 'updated' frontmatter field
				await this.app.vault.modify(file, content);
				await this.app.fileManager.processFrontMatter(file, (fm) => {
					fm.updated = dateStr;
				});
				logger?.success(`已更新测试文件：${file.path}`);
			}
		}

		return totalUpdated;
	}

	private findTestFilesForDetail(folder: TFolder, detailSlug: string): TFile[] {
		return this.getAllTestFiles(folder).filter(
			(f) => f.basename.startsWith(detailSlug) || f.basename.includes(detailSlug)
		);
	}

	private getAllTestFiles(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				files.push(child);
			} else if (child instanceof TFolder) {
				files.push(...this.getAllTestFiles(child));
			}
		}
		return files;
	}
}
