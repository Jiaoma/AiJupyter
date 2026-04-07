import { App, TFile, TFolder } from 'obsidian';
import type { AiJupyterSettings } from '../settings-data';
import type { TestService } from './test-service';
import type { IdeaStatus } from '../models/idea';
import type { TestStatus } from '../models/test-case';

export interface IdeaStatusInfo {
	ideaFile: TFile;
	ideaName: string;
	details: DetailStatusInfo[];
	overallStatus: IdeaStatus;
	totalTests: number;
	passedTests: number;
	failedTests: number;
	pendingTests: number;
}

export interface DetailStatusInfo {
	slug: string;
	filePath: string;
	testStatuses: TestStatus[];
}

export class StatusService {
	private app: App;
	private settings: AiJupyterSettings;
	private testService: TestService;
	private statusCache: Map<string, IdeaStatusInfo> = new Map();

	constructor(app: App, settings: AiJupyterSettings, testService: TestService) {
		this.app = app;
		this.settings = settings;
		this.testService = testService;
	}

	updateSettings(settings: AiJupyterSettings): void {
		this.settings = settings;
	}

	clearCache(): void {
		this.statusCache.clear();
	}

	async getIdeaStatus(ideaFile: TFile): Promise<IdeaStatusInfo> {
		const cached = this.statusCache.get(ideaFile.path);
		if (cached) return cached;

		const info = await this.computeIdeaStatus(ideaFile);
		this.statusCache.set(ideaFile.path, info);
		return info;
	}

	async getAllIdeaStatuses(): Promise<IdeaStatusInfo[]> {
		const ideasFolder = this.app.vault.getAbstractFileByPath(this.settings.ideasFolder);
		if (!(ideasFolder instanceof TFolder)) return [];

		const results: IdeaStatusInfo[] = [];
		for (const child of ideasFolder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				results.push(await this.getIdeaStatus(child));
			}
		}
		return results;
	}

	getStatusForDetailSlug(slug: string): IdeaStatus {
		// Look through cache for a detail with this slug
		for (const info of this.statusCache.values()) {
			const detail = info.details.find((d) => d.slug === slug);
			if (detail) {
				return this.computeDetailStatus(detail.testStatuses);
			}
		}
		return 'no-tests';
	}

	async refreshAll(): Promise<void> {
		this.statusCache.clear();
		await this.getAllIdeaStatuses();
	}

	private async computeIdeaStatus(ideaFile: TFile): Promise<IdeaStatusInfo> {
		const ideaName = ideaFile.basename;
		const subfolder = ideaName.replace(/^idea-/, '');

		// Find all detail documents linked from this idea
		const content = await this.app.vault.read(ideaFile);
		const wikiLinks = this.extractWikiLinks(content);

		// Get test statuses for each detail
		const allTestStatuses = await this.testService.getAllTestStatuses();
		const details: DetailStatusInfo[] = [];

		for (const link of wikiLinks) {
			const detailPath = `${this.settings.detailsFolder}/${subfolder}/${link}.md`;
			const testStatuses = allTestStatuses.get(link) || [];
			details.push({
				slug: link,
				filePath: detailPath,
				testStatuses,
			});
		}

		let totalTests = 0;
		let passedTests = 0;
		let failedTests = 0;
		let pendingTests = 0;

		for (const detail of details) {
			for (const status of detail.testStatuses) {
				totalTests++;
				if (status === 'pass') passedTests++;
				else if (status === 'fail') failedTests++;
				else pendingTests++;
			}
		}

		let overallStatus: IdeaStatus;
		if (totalTests === 0) {
			overallStatus = 'no-tests';
		} else if (failedTests > 0) {
			overallStatus = 'has-fail';
		} else if (pendingTests > 0) {
			overallStatus = 'in-progress';
		} else {
			overallStatus = 'all-pass';
		}

		return {
			ideaFile,
			ideaName,
			details,
			overallStatus,
			totalTests,
			passedTests,
			failedTests,
			pendingTests,
		};
	}

	private computeDetailStatus(testStatuses: TestStatus[]): IdeaStatus {
		if (testStatuses.length === 0) return 'no-tests';
		if (testStatuses.some((s) => s === 'fail')) return 'has-fail';
		if (testStatuses.some((s) => s === 'pending')) return 'in-progress';
		return 'all-pass';
	}

	private extractWikiLinks(content: string): string[] {
		const links: string[] = [];
		const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
		let match;
		while ((match = regex.exec(content)) !== null) {
			links.push(match[1]);
		}
		return links;
	}
}
