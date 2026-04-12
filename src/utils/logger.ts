import { App, TFolder } from 'obsidian';

export type LogLevel = 'info' | 'success' | 'warn' | 'error';

interface LogEntry {
	time: Date;
	level: LogLevel;
	message: string;
}

const LEVEL_PREFIX: Record<LogLevel, string> = {
	info: 'ℹ',
	success: '✓',
	warn: '⚠',
	error: '✗',
};

/**
 * Collects operation log entries in memory during an operation,
 * then flushes them to a Markdown file in the vault's logs folder.
 */
export class OperationLogger {
	private app: App;
	private logsFolder: string;
	private operation: string;
	private entries: LogEntry[] = [];
	private startTime: Date;

	constructor(app: App, logsFolder: string, operation: string) {
		this.app = app;
		this.logsFolder = logsFolder;
		this.operation = operation;
		this.startTime = new Date();
	}

	info(message: string): void {
		this.entries.push({ time: new Date(), level: 'info', message });
	}

	success(message: string): void {
		this.entries.push({ time: new Date(), level: 'success', message });
	}

	warn(message: string): void {
		this.entries.push({ time: new Date(), level: 'warn', message });
	}

	error(message: string): void {
		this.entries.push({ time: new Date(), level: 'error', message });
	}

	/** Write all collected entries to a Markdown file in the logs folder. */
	async flush(): Promise<string | null> {
		if (!this.entries.length) return null;

		const endTime = new Date();
		const elapsed = ((endTime.getTime() - this.startTime.getTime()) / 1000).toFixed(1);

		const timestamp = this.formatTimestamp(this.startTime);
		const fileName = `${timestamp}-${this.slugify(this.operation)}.md`;
		const filePath = `${this.logsFolder}/${fileName}`;

		const content = this.renderMarkdown(elapsed);

		await this.ensureFolder(this.logsFolder);
		await this.app.vault.create(filePath, content);

		return filePath;
	}

	private renderMarkdown(elapsed: string): string {
		const started = this.formatDatetime(this.startTime);
		const lines: string[] = [
			`# 操作日志：${this.operation}`,
			'',
			`- **开始时间**：${started}`,
			`- **耗时**：${elapsed}s`,
			`- **条目数**：${this.entries.length}`,
			'',
			'## 详细记录',
			'',
		];

		for (const entry of this.entries) {
			const relMs = entry.time.getTime() - this.startTime.getTime();
			const relStr = relMs < 1000
				? `+${relMs}ms`
				: `+${(relMs / 1000).toFixed(1)}s`;
			const prefix = LEVEL_PREFIX[entry.level];
			lines.push(`- \`${relStr}\` ${prefix} ${entry.message}`);
		}

		return lines.join('\n');
	}

	private formatTimestamp(d: Date): string {
		const pad = (n: number) => String(n).padStart(2, '0');
		return (
			`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
			`-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
		);
	}

	private formatDatetime(d: Date): string {
		const pad = (n: number) => String(n).padStart(2, '0');
		return (
			`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
			`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
		);
	}

	private slugify(s: string): string {
		return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '');
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
