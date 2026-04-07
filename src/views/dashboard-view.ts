import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { StatusService, IdeaStatusInfo } from '../services/status-service';

export const DASHBOARD_VIEW_TYPE = 'aijupyter-dashboard';

export class DashboardView extends ItemView {
	private statusService: StatusService;

	constructor(leaf: WorkspaceLeaf, statusService: StatusService) {
		super(leaf);
		this.statusService = statusService;
	}

	getViewType(): string {
		return DASHBOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'AiJupyter 仪表盘';
	}

	getIcon(): string {
		return 'bar-chart';
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async refresh(): Promise<void> {
		await this.render();
	}

	private async render(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();

		const root = container.createDiv({ cls: 'aijupyter-dashboard' });
		root.createEl('h2', { text: 'AiJupyter 想法状态仪表盘' });

		const statuses = await this.statusService.getAllIdeaStatuses();

		// Summary cards
		this.renderSummary(root, statuses);

		// Detail table
		this.renderTable(root, statuses);
	}

	private renderSummary(root: HTMLElement, statuses: IdeaStatusInfo[]): void {
		const summary = root.createDiv({ cls: 'aijupyter-dashboard-summary' });

		const totalIdeas = statuses.length;
		const allPass = statuses.filter((s) => s.overallStatus === 'all-pass').length;
		const hasFail = statuses.filter((s) => s.overallStatus === 'has-fail').length;
		const inProgress = statuses.filter((s) => s.overallStatus === 'in-progress').length;
		const totalTests = statuses.reduce((sum, s) => sum + s.totalTests, 0);
		const passedTests = statuses.reduce((sum, s) => sum + s.passedTests, 0);

		const cards = [
			{ number: totalIdeas, label: '想法总数', color: '' },
			{ number: allPass, label: '全部通过', color: '#28a745' },
			{ number: hasFail, label: '存在失败', color: '#dc3545' },
			{ number: inProgress, label: '进行中', color: '#ffc107' },
			{ number: totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0, label: '用例通过率 %', color: '' },
		];

		for (const card of cards) {
			const el = summary.createDiv({ cls: 'aijupyter-dashboard-card' });
			const numEl = el.createDiv({ cls: 'aijupyter-dashboard-card-number' });
			numEl.textContent = String(card.number);
			if (card.color) numEl.style.color = card.color;
			el.createDiv({ cls: 'aijupyter-dashboard-card-label', text: card.label });
		}
	}

	private renderTable(root: HTMLElement, statuses: IdeaStatusInfo[]): void {
		const table = root.createEl('table', { cls: 'aijupyter-dashboard-table' });

		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		for (const h of ['想法', '状态', '详细设计数', '通过', '失败', '待定', '通过率']) {
			headerRow.createEl('th', { text: h });
		}

		const tbody = table.createEl('tbody');
		for (const info of statuses) {
			const row = tbody.createEl('tr');

			// Idea name — clickable
			const nameCell = row.createEl('td');
			const link = nameCell.createEl('span', {
				cls: 'aijupyter-dashboard-link',
				text: info.ideaName,
			});
			link.addEventListener('click', () => {
				this.app.workspace.openLinkText(info.ideaFile.path, '', false);
			});

			// Status badge
			const statusCell = row.createEl('td');
			const badge = statusCell.createEl('span', { cls: 'aijupyter-badge' });
			const statusMap: Record<string, { text: string; cls: string }> = {
				'all-pass': { text: 'PASS', cls: 'aijupyter-badge-pass' },
				'has-fail': { text: 'FAIL', cls: 'aijupyter-badge-fail' },
				'in-progress': { text: 'PENDING', cls: 'aijupyter-badge-pending' },
				'no-tests': { text: 'NO TESTS', cls: '' },
			};
			const s = statusMap[info.overallStatus] || statusMap['no-tests'];
			badge.textContent = s.text;
			if (s.cls) badge.addClass(s.cls);

			row.createEl('td', { text: String(info.details.length) });
			row.createEl('td', { text: String(info.passedTests) });
			row.createEl('td', { text: String(info.failedTests) });
			row.createEl('td', { text: String(info.pendingTests) });

			const rate = info.totalTests > 0 ? Math.round((info.passedTests / info.totalTests) * 100) : 0;
			const rateCell = row.createEl('td');
			rateCell.createDiv({ text: `${rate}%` });
			const progressBar = rateCell.createDiv({ cls: 'aijupyter-progress' });
			const fill = progressBar.createDiv({
				cls: `aijupyter-progress-fill ${rate === 100 ? 'aijupyter-progress-fill-pass' : 'aijupyter-progress-fill-fail'}`,
			});
			fill.style.width = `${rate}%`;
		}
	}
}
