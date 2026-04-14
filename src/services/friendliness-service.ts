import { App, Notice, TFile } from 'obsidian';
import type { AiJupyterSettings } from '../settings-data';
import type { ClaudeService } from './claude-service';
import type { FriendlinessResult, UnfriendlySpan } from '../models/friendliness';
import { ProgressIndicator } from '../views/progress-indicator';
import { OperationLogger } from '../utils/logger';

const FRIENDLINESS_PROMPT = `你是一个AI协作文档质量审核专家。分析以下文档内容，找出对 AI（如 Claude）不友好的文本片段。

"对AI不友好"是指：AI 在处理这些文本时容易产生歧义理解、无法准确执行、或缺乏足够信息来判断的内容。

请识别以下 4 类问题：

1. **ambiguous**（歧义）— 同一描述可以有多种合理但不同的解读
   示例："处理好用户数据"（处理可以是存储、清洗、加密、删除……）

2. **vague**（模糊）— 缺乏具体细节，过于笼统
   示例："系统要快"（快是多快？100ms？1s？）

3. **no-criteria**（无验收标准）— 缺少可验证的完成条件
   示例："优化用户体验"（怎样算优化了？）

4. **imprecise**（不精确）— 使用了不够精确的词汇或度量
   示例："大约支持 100 个用户"（大约是 80？还是 120？）

严格按以下 JSON 格式返回，text 字段必须是原文中的**精确原文片段**：
{
  "spans": [
    {
      "text": "原文中的精确文本片段",
      "category": "ambiguous|vague|no-criteria|imprecise",
      "suggestion": "简短的改进建议"
    }
  ]
}

如果文档没有问题，返回 {"spans": []}`;

export class FriendlinessService {
	private app: App;
	private settings: AiJupyterSettings;
	private claudeService: ClaudeService;
	private cache: Map<string, FriendlinessResult> = new Map();

	constructor(app: App, settings: AiJupyterSettings, claudeService: ClaudeService) {
		this.app = app;
		this.settings = settings;
		this.claudeService = claudeService;
	}

	updateSettings(settings: AiJupyterSettings): void {
		this.settings = settings;
	}

	async checkFriendliness(file: TFile): Promise<FriendlinessResult> {
		const content = await this.app.vault.read(file);
		const body = this.stripFrontmatter(content);

		if (!body.trim()) {
			new Notice('文档内容为空');
			return { filePath: file.path, spans: [] };
		}

		const logger = new OperationLogger(this.app, this.settings.logsFolder, `AI 友好度检查 - ${file.basename}`);
		const progress = new ProgressIndicator();
		progress.show('AI 友好度检查');

		logger.info(`开始检查文档：${file.path}`);

		try {
			progress.setIndeterminate('正在调用 Claude 分析文档友好度...');

			const fullPrompt = `${FRIENDLINESS_PROMPT}\n\n文档内容：\n\n${body}`;
			const response = await this.claudeService.sendPrompt(fullPrompt);

			logger.info(`Claude 分析完成`);

			const spans = this.parseResponse(response);
			logger.info(`识别到 ${spans.length} 个不友好文本片段`);

			for (const span of spans) {
				logger.info(`[${span.category}] "${span.text.slice(0, 50)}${span.text.length > 50 ? '...' : ''}" → ${span.suggestion}`);
			}

			const result: FriendlinessResult = { filePath: file.path, spans };
			this.cache.set(file.path, result);

			const logPath = await logger.flush();
			progress.dismiss();
			new Notice(`友好度检查完成：发现 ${spans.length} 个问题${logPath ? `\n日志：${logPath}` : ''}`);

			return result;
		} catch (e) {
			logger.error(`检查失败：${(e as Error).message}`);
			await logger.flush();
			progress.dismiss();
			throw e;
		}
	}

	getCached(filePath: string): FriendlinessResult | undefined {
		return this.cache.get(filePath);
	}

	clearCache(): void {
		this.cache.clear();
	}

	private parseResponse(text: string): UnfriendlySpan[] {
		const jsonMatch = text.match(/\{[\s\S]*"spans"[\s\S]*\}/);
		if (!jsonMatch) {
			return [];
		}

		try {
			const parsed = JSON.parse(jsonMatch[0]);
			if (!parsed.spans || !Array.isArray(parsed.spans)) {
				return [];
			}
			return parsed.spans.filter(
				(s: Record<string, unknown>) =>
					typeof s.text === 'string' &&
					typeof s.category === 'string' &&
					typeof s.suggestion === 'string'
			) as UnfriendlySpan[];
		} catch {
			return [];
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
