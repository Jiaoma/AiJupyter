import { Notice } from 'obsidian';
import type { ChildProcess } from 'child_process';
import type { AiJupyterSettings } from '../settings-data';
import type { AnalysisResult } from '../models/idea';
import { shellExec, shellSpawn } from '../utils/shell-env';

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

export interface StreamCallbacks {
	onDelta: (text: string) => void;
	onComplete: (fullResult: string, sessionId: string) => void;
	onError: (error: Error) => void;
}

export class ClaudeService {
	private settings: AiJupyterSettings;
	private activeProcess: ChildProcess | null = null;
	/** Conversation history for API-mode multi-turn */
	private apiMessages: Array<{ role: string; content: string }> = [];

	constructor(settings: AiJupyterSettings) {
		this.settings = settings;
	}

	updateSettings(settings: AiJupyterSettings): void {
		this.settings = settings;
	}

	async analyzeIdea(content: string): Promise<AnalysisResult> {
		const fullPrompt = `${ANALYSIS_PROMPT}\n\n想法描述：\n${content}`;
		const text = await this.sendPrompt(fullPrompt);
		return this.extractJson(text);
	}

	async sendPrompt(prompt: string): Promise<string> {
		if (this.settings.claudeMode === 'cli') {
			return this.callCliRaw(prompt);
		} else {
			return this.callApiRaw(prompt);
		}
	}

	/**
	 * Stream a prompt and get real-time text deltas via callbacks.
	 * Returns a session ID for multi-turn continuation (CLI mode).
	 */
	async streamPrompt(prompt: string, callbacks: StreamCallbacks): Promise<void> {
		if (this.settings.claudeMode === 'cli') {
			await this.streamCli(prompt, undefined, callbacks);
		} else {
			await this.streamApi(prompt, false, callbacks);
		}
	}

	/**
	 * Continue a conversation with a follow-up message.
	 * CLI mode uses --resume with the session ID.
	 * API mode appends to the conversation history.
	 */
	async streamContinue(sessionId: string, message: string, callbacks: StreamCallbacks): Promise<void> {
		if (this.settings.claudeMode === 'cli') {
			await this.streamCli(message, sessionId, callbacks);
		} else {
			await this.streamApi(message, true, callbacks);
		}
	}

	/**
	 * Cancel any in-progress streaming process.
	 */
	cancelStream(): void {
		if (this.activeProcess) {
			this.activeProcess.kill('SIGTERM');
			this.activeProcess = null;
		}
	}

	/**
	 * Reset API conversation history (call when starting a fresh generation).
	 */
	resetConversation(): void {
		this.apiMessages = [];
	}

	private async callCliRaw(prompt: string): Promise<string> {
		const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
		const cmd = `claude --print --output-format json -p "${escapedPrompt}"`;

		try {
			const { stdout } = await shellExec(cmd, this.settings.shell, this.settings.extraPath);

			try {
				const response = JSON.parse(stdout);
				return typeof response === 'string' ? response : response.result || JSON.stringify(response);
			} catch {
				return stdout;
			}
		} catch (e) {
			new Notice(`Claude CLI 调用失败: ${(e as Error).message}`);
			throw e;
		}
	}

	private async callApiRaw(prompt: string): Promise<string> {
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
		return data.content?.[0]?.text || '';
	}

	private async streamCli(prompt: string, sessionId: string | undefined, callbacks: StreamCallbacks): Promise<void> {
		const args = [
			'--print',
			'--output-format', 'stream-json',
			'--verbose',
			'--include-partial-messages',
		];

		if (this.settings.model) {
			args.push('--model', this.settings.model);
		}

		if (sessionId) {
			args.push('--resume', sessionId);
		}

		args.push('-p', prompt);

		this.activeProcess = await shellSpawn(
			'claude',
			args,
			this.settings.shell,
			this.settings.extraPath,
			{
				onDelta: callbacks.onDelta,
				onComplete: (result, sid) => {
					this.activeProcess = null;
					callbacks.onComplete(result, sid);
				},
				onError: (err) => {
					this.activeProcess = null;
					callbacks.onError(err);
				},
			}
		);
	}

	private async streamApi(prompt: string, isContinuation: boolean, callbacks: StreamCallbacks): Promise<void> {
		if (!this.settings.apiKey) {
			callbacks.onError(new Error('请在设置中配置 Anthropic API Key'));
			return;
		}

		if (!isContinuation) {
			this.apiMessages = [];
		}

		this.apiMessages.push({ role: 'user', content: prompt });

		try {
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
					stream: true,
					messages: this.apiMessages,
				}),
			});

			if (!response.ok) {
				const errText = await response.text();
				callbacks.onError(new Error(`API 调用失败 (${response.status}): ${errText}`));
				return;
			}

			const reader = response.body?.getReader();
			if (!reader) {
				callbacks.onError(new Error('No readable stream from API'));
				return;
			}

			const decoder = new TextDecoder();
			let fullResult = '';
			let sseBuffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				sseBuffer += decoder.decode(value, { stream: true });
				const events = sseBuffer.split('\n\n');
				sseBuffer = events.pop() || '';

				for (const event of events) {
					const dataLine = event.split('\n').find(l => l.startsWith('data: '));
					if (!dataLine) continue;

					const json = dataLine.slice(6);
					if (json === '[DONE]') continue;

					try {
						const parsed = JSON.parse(json);
						if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
							const text = parsed.delta.text;
							if (text) {
								fullResult += text;
								callbacks.onDelta(text);
							}
						}
					} catch {
						// ignore unparseable SSE data
					}
				}
			}

			// Store assistant response for multi-turn
			this.apiMessages.push({ role: 'assistant', content: fullResult });
			callbacks.onComplete(fullResult, '');
		} catch (err) {
			callbacks.onError(err as Error);
		}
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
