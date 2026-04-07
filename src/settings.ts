import { App, PluginSettingTab, Setting } from 'obsidian';
import type AiJupyterPlugin from './main';
import type { ShellType } from './settings-data';

export class AiJupyterSettingTab extends PluginSettingTab {
	plugin: AiJupyterPlugin;

	constructor(app: App, plugin: AiJupyterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'AiJupyter 设置' });

		// ── Folder settings ──
		containerEl.createEl('h3', { text: '目录配置' });

		new Setting(containerEl)
			.setName('想法文档目录')
			.setDesc('存放 L0 顶层想法文档的目录')
			.addText((text) =>
				text
					.setPlaceholder('ideas')
					.setValue(this.plugin.settings.ideasFolder)
					.onChange(async (value) => {
						this.plugin.settings.ideasFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('详细设计目录')
			.setDesc('存放 L1 详细设计文档的目录')
			.addText((text) =>
				text
					.setPlaceholder('details')
					.setValue(this.plugin.settings.detailsFolder)
					.onChange(async (value) => {
						this.plugin.settings.detailsFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Diff 记录目录')
			.setDesc('存放代码变更 diff 记录的目录')
			.addText((text) =>
				text
					.setPlaceholder('diffs')
					.setValue(this.plugin.settings.diffsFolder)
					.onChange(async (value) => {
						this.plugin.settings.diffsFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('用例目录')
			.setDesc('存放测试用例文档的目录')
			.addText((text) =>
				text
					.setPlaceholder('tests')
					.setValue(this.plugin.settings.testsFolder)
					.onChange(async (value) => {
						this.plugin.settings.testsFolder = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Shell settings ──
		containerEl.createEl('h3', { text: 'Shell 配置' });

		new Setting(containerEl)
			.setName('Shell')
			.setDesc('用于执行命令的 shell（macOS 默认 zsh，claude CLI 需在对应 shell 下可用）')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('/bin/zsh', 'zsh (推荐)')
					.addOption('/bin/bash', 'bash')
					.addOption('/bin/sh', 'sh')
					.setValue(this.plugin.settings.shell)
					.onChange(async (value) => {
						this.plugin.settings.shell = value as ShellType;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('额外 PATH')
			.setDesc('追加到 PATH 的目录（多个用 : 分隔）。留空则自动从 login shell 获取。如 claude 仍找不到，可填入 claude 所在目录')
			.addText((text) =>
				text
					.setPlaceholder('/usr/local/bin:/opt/homebrew/bin')
					.setValue(this.plugin.settings.extraPath)
					.onChange(async (value) => {
						this.plugin.settings.extraPath = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Claude settings ──
		containerEl.createEl('h3', { text: 'Claude 集成' });

		new Setting(containerEl)
			.setName('调用模式')
			.setDesc('选择通过 CLI 还是 API 调用 Claude')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('cli', 'Claude Code CLI')
					.addOption('api', 'Anthropic API')
					.setValue(this.plugin.settings.claudeMode)
					.onChange(async (value) => {
						this.plugin.settings.claudeMode = value as 'cli' | 'api';
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.claudeMode === 'api') {
			new Setting(containerEl)
				.setName('API Key')
				.setDesc('Anthropic API Key')
				.addText((text) =>
					text
						.setPlaceholder('sk-ant-...')
						.setValue(this.plugin.settings.apiKey)
						.onChange(async (value) => {
							this.plugin.settings.apiKey = value;
							await this.plugin.saveSettings();
						})
				);
		}

		new Setting(containerEl)
			.setName('模型')
			.setDesc('使用的 Claude 模型')
			.addText((text) =>
				text
					.setPlaceholder('claude-sonnet-4-6')
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Behavior settings ──
		containerEl.createEl('h3', { text: '行为配置' });

		new Setting(containerEl)
			.setName('保存时自动识别链接')
			.setDesc('在保存想法文档时自动识别关键语句并转化为链接')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoLinkOnSave).onChange(async (value) => {
					this.plugin.settings.autoLinkOnSave = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('自动追踪 Git Diff')
			.setDesc('自动检测 git commit 并生成 diff 记录文档')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoTrackDiffs).onChange(async (value) => {
					this.plugin.settings.autoTrackDiffs = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('自动执行用例')
			.setDesc('代码变更后自动执行测试用例')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoRunTests).onChange(async (value) => {
					this.plugin.settings.autoRunTests = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('测试命令')
			.setDesc('执行测试用例的 shell 命令')
			.addText((text) =>
				text
					.setPlaceholder('npm test')
					.setValue(this.plugin.settings.testCommand)
					.onChange(async (value) => {
						this.plugin.settings.testCommand = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Appearance settings ──
		containerEl.createEl('h3', { text: '外观' });

		new Setting(containerEl)
			.setName('启用状态着色')
			.setDesc('根据用例状态为链接添加背景颜色')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableStatusColors).onChange(async (value) => {
					this.plugin.settings.enableStatusColors = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('显示面包屑导航')
			.setDesc('在详细设计和用例文档顶部显示导航路径')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showBreadcrumbs).onChange(async (value) => {
					this.plugin.settings.showBreadcrumbs = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('显示侧边栏概览')
			.setDesc('在右侧边栏显示当前想法的文档树')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showSidePanel).onChange(async (value) => {
					this.plugin.settings.showSidePanel = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
