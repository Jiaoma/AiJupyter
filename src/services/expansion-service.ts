import { App, Notice, TFile } from 'obsidian';
import type { AiJupyterSettings } from '../settings-data';
import type { ClaudeService } from './claude-service';
import { ProgressIndicator } from '../views/progress-indicator';
import { OperationLogger } from '../utils/logger';

type DocType = 'overview' | 'requirements' | 'req-impl-mapping' | 'test-cases' | 'changelog' | 'generic';

const EXPANSION_PROMPTS: Record<DocType, string> = {
	overview: `你是一个资深产品经理和技术架构师。请扩写以下项目概览文档：
- 完善每个用例���详细流程（主要流程至少 5 步，包含异常流程）
- 补充利益相关者分析
- 识别并补充潜在风险
- 完善非功能性需求（性能指标要具体、可量化）
- 补充约束与假设

保持原有的 Markdown 格式和结构，在原有内容基础上扩充和细化。不要删除现有内容，只增加和完善。
请直接返回完整的文档内容（不含 frontmatter，不含 \`\`\`markdown 代码块包裹）。`,

	requirements: `你是一个资深需求分析师。请扩写以下需求文档：
- 为每个需求补充完整的 REQ-ID（如果缺失）
- 细化验收标准（每个需求至少 2 条可验证的验收条件）
- 补充输入/输出的数据格式描述
- 识别需求之间的依赖关系
- 建议可能遗漏的需求
- 补充业务规则

保持原有的 Markdown 格式和表格结构。不要删除现有内容，只增加和完善。
请直接返回完整的文档内容（不含 frontmatter，不含 \`\`\`markdown 代码块包裹）。`,

	'req-impl-mapping': `你是一个项目管理专家。请扩写以下需求-实现追踪矩阵：
- 根据文档中已有的需求信息，填充映射表中的空白项
- 完善覆盖率统计
- 添加风险项标注（未覆盖或状态滞后的需求）

保持原有的 Markdown 格式和表格结构。不要删除现有内容。
请直接返回完整的文档内容（不含 frontmatter，不含 \`\`\`markdown 代码块包裹）。`,

	'test-cases': `你是一个资深 QA 工程师。请扩写以下测试用例文档：
- 为每个用例补充完整的 TC-ID（如果缺失）
- 增加边界条件测试用例
- 增加负面/异常流程测试用例
- 增加性能和并发相关测试用例（如适用）
- 完善每个用例的前置条件和具体步骤
- 使期望结果更加具体和可验证

保持原有的 Markdown 格式和表格结构。不要删除现有内容，只增加和完善。
请直接返回完整的文档内容（不含 frontmatter，不含 \`\`\`markdown 代码块包裹）。`,

	changelog: `你是一个项目管理专家。请扩写以下变更日志：
- 根据文档内容推断并补充可能的变更记录
- 确保格式符合 Keep a Changelog 规范
- 完善变更描述，使其更加具体

保持原有的 Markdown 格式。不要删除现有内容。
请直接返回完整的文档内容（不含 frontmatter，不含 \`\`\`markdown 代码块包裹）。`,

	generic: `你是一个技术文档专家。请扩写以下文档：
- 在保持原有结构的基础上丰富内容
- 补充细节和具体示例
- 确保描述清晰、完整、无歧义
- 如发现逻辑缺失或不一致之处，请补充或标注

保持原有的 Markdown 格式。不要删除现有内容，只增加和完善。
请直接返回完整的文档内容（不含 frontmatter，不含 \`\`\`markdown 代码块包裹）。`,
};

export class ExpansionService {
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

	async expandDocument(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		const { frontmatter, body } = this.splitFrontmatter(content);

		if (!body.trim()) {
			new Notice('文档内容为空，无法扩写');
			return;
		}

		const docType = this.detectDocType(file, frontmatter);
		const logger = new OperationLogger(this.app, this.settings.logsFolder, `AI 扩写 - ${file.basename}`);
		const progress = new ProgressIndicator();
		progress.show('AI 扩写');

		logger.info(`开始扩写文档：${file.path}`);
		logger.info(`文档类型：${docType}`);

		try {
			progress.setIndeterminate('正在调用 Claude 进行扩写...');

			const systemPrompt = EXPANSION_PROMPTS[docType];
			const fullPrompt = `${systemPrompt}\n\n以下是文档内容：\n\n${body}`;

			const expanded = await this.claudeService.sendPrompt(fullPrompt);
			logger.info(`Claude 扩写完成，返回 ${expanded.length} 字符`);

			// Strip any markdown code block wrapper Claude might add
			const cleanExpanded = this.stripCodeBlockWrapper(expanded);

			// Reconstruct: frontmatter + expanded body
			const newContent = frontmatter ? `${frontmatter}\n${cleanExpanded}` : cleanExpanded;

			progress.setDeterminate('正在写入扩写结果...');
			progress.update(0, 1);
			await this.app.vault.modify(file, newContent);
			progress.update(1, 1);
			logger.success(`文档已更新：${file.path}`);

			const logPath = await logger.flush();
			progress.dismiss();
			new Notice(`文档扩写完成${logPath ? `\n日志：${logPath}` : ''}`);
		} catch (e) {
			logger.error(`扩写失败：${(e as Error).message}`);
			await logger.flush();
			progress.dismiss();
			throw e;
		}
	}

	private detectDocType(file: TFile, frontmatter: string): DocType {
		// Check frontmatter for type field
		const typeMatch = frontmatter.match(/^type:\s*(.+)$/m);
		if (typeMatch) {
			const type = typeMatch[1].trim().toLowerCase();
			if (type in EXPANSION_PROMPTS) {
				return type as DocType;
			}
		}

		// Fallback: detect from filename
		const basename = file.basename.toLowerCase();
		if (basename.includes('overview')) return 'overview';
		if (basename.includes('requirement')) return 'requirements';
		if (basename.includes('req-impl') || basename.includes('mapping')) return 'req-impl-mapping';
		if (basename.includes('test-case')) return 'test-cases';
		if (basename.includes('changelog')) return 'changelog';

		return 'generic';
	}

	private splitFrontmatter(content: string): { frontmatter: string; body: string } {
		const match = content.match(/^(---\n[\s\S]*?\n---\n)/);
		if (match) {
			return {
				frontmatter: match[1].trimEnd(),
				body: content.slice(match[1].length),
			};
		}
		return { frontmatter: '', body: content };
	}

	private stripCodeBlockWrapper(text: string): string {
		// Remove ```markdown ... ``` wrapper if Claude added one
		const stripped = text.replace(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/m, '$1');
		return stripped.trim() + '\n';
	}
}
