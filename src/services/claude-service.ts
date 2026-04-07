import { Notice } from 'obsidian';
import type { AiJupyterSettings } from '../settings-data';
import type { AnalysisResult } from '../models/idea';
import { shellExec } from '../utils/shell-env';

const ANALYSIS_PROMPT = `你是一个技术架构师。分析以下想法描述，识别其中的关键实现语句（每个语句代表一个独立的技术实现点）。

对于每个关键语句，生成：
1. slug: 用于文件名的英文短横线格式标识（如 jwt-token-validation）
2. displayText: 原文中的关键语句文本
3. detailContent: 详细的技术实现方案（markdown 格式，200-500字）
4. testCases: 建议的测试用例数组，每个包含 name, input, expected, precondition, steps

严格按以下 JSON 格式返回，不要包含其他文字：
{
  "keywords": [
    {
      "original": "原文中包含该关键语句的完整句子片段",
      "slug": "keyword-slug",
      "displayText": "关键语句显示文本",
      "detailContent": "详细实现方案...",
      "testCases": [
        {
          "name": "用例名称",
          "input": "输入描述",
          "expected": "期望结果",
          "precondition": "前置条件",
          "steps": "执行步骤"
        }
      ]
    }
  ]
}`;

export class ClaudeService {
	private settings: AiJupyterSettings;

	constructor(settings: AiJupyterSettings) {
		this.settings = settings;
	}

	updateSettings(settings: AiJupyterSettings): void {
		this.settings = settings;
	}

	async analyzeIdea(content: string): Promise<AnalysisResult> {
		const fullPrompt = `${ANALYSIS_PROMPT}\n\n想法描述：\n${content}`;

		if (this.settings.claudeMode === 'cli') {
			return this.callCli(fullPrompt);
		} else {
			return this.callApi(fullPrompt);
		}
	}

	private async callCli(prompt: string): Promise<AnalysisResult> {
		const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
		const cmd = `claude --print --output-format json -p "${escapedPrompt}"`;

		try {
			const { stdout } = await shellExec(cmd, this.settings.shell, this.settings.extraPath);

			try {
				const response = JSON.parse(stdout);
				const text = typeof response === 'string' ? response : response.result || JSON.stringify(response);
				return this.extractJson(text);
			} catch (e) {
				try {
					return this.extractJson(stdout);
				} catch {
					throw new Error(`解析 Claude 响应失败: ${(e as Error).message}`);
				}
			}
		} catch (e) {
			new Notice(`Claude CLI 调用失败: ${(e as Error).message}`);
			throw e;
		}
	}

	private async callApi(prompt: string): Promise<AnalysisResult> {
		if (!this.settings.apiKey) {
			throw new Error('请在设置中配置 Anthropic API Key');
		}

		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': this.settings.apiKey,
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify({
				model: this.settings.model,
				max_tokens: 4096,
				messages: [{ role: 'user', content: prompt }],
			}),
		});

		if (!response.ok) {
			const errText = await response.text();
			throw new Error(`API 调用失败 (${response.status}): ${errText}`);
		}

		const data = await response.json();
		const text = data.content?.[0]?.text || '';
		return this.extractJson(text);
	}

	private extractJson(text: string): AnalysisResult {
		// Try to find JSON block in the text
		const jsonMatch = text.match(/\{[\s\S]*"keywords"[\s\S]*\}/);
		if (!jsonMatch) {
			throw new Error('无法从 Claude 响应中提取 JSON');
		}

		const parsed = JSON.parse(jsonMatch[0]);
		if (!parsed.keywords || !Array.isArray(parsed.keywords)) {
			throw new Error('Claude 响应格式不正确：缺少 keywords 数组');
		}

		return parsed as AnalysisResult;
	}
}
