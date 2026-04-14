import { ItemView, MarkdownRenderer, WorkspaceLeaf } from 'obsidian';
import type { AiJupyterSettings } from '../settings-data';
import type { ClaudeService, StreamCallbacks } from '../services/claude-service';

export const CHAT_PANEL_VIEW_TYPE = 'aijupyter-chat-panel';

export interface ChatGenerationParams {
	/** Title shown in the panel header */
	title: string;
	/** Where the confirmed document will be written */
	targetPath: string;
	/** The initial prompt sent to Claude */
	initialPrompt: string;
	/** Called when user clicks "Confirm" — receives the latest AI content */
	onConfirm: (content: string) => Promise<void>;
}

export class ChatPanelView extends ItemView {
	private settings: AiJupyterSettings;
	private claudeService: ClaudeService;

	// DOM elements
	private headerTitleEl!: HTMLElement;
	private messagesEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private sendBtn!: HTMLButtonElement;
	private confirmBtn!: HTMLButtonElement;
	private cancelBtn!: HTMLButtonElement;

	// State
	private sessionId = '';
	private latestAssistantContent = '';
	private isStreaming = false;
	private currentBubbleEl: HTMLElement | null = null;
	private currentBubbleContent = '';
	private onConfirmCallback: ((content: string) => Promise<void>) | null = null;

	constructor(leaf: WorkspaceLeaf, settings: AiJupyterSettings, claudeService: ClaudeService) {
		super(leaf);
		this.settings = settings;
		this.claudeService = claudeService;
	}

	getViewType(): string {
		return CHAT_PANEL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'AiJupyter 对话';
	}

	getIcon(): string {
		return 'message-square';
	}

	updateSettings(settings: AiJupyterSettings): void {
		this.settings = settings;
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		const root = container.createDiv({ cls: 'aijupyter-chat-panel' });

		// Header
		const header = root.createDiv({ cls: 'aijupyter-chat-header' });
		this.headerTitleEl = header.createDiv({ cls: 'aijupyter-chat-title', text: 'AiJupyter 对话' });

		// Messages area
		this.messagesEl = root.createDiv({ cls: 'aijupyter-chat-messages' });

		// Input area
		const inputArea = root.createDiv({ cls: 'aijupyter-chat-input-area' });
		this.inputEl = inputArea.createEl('textarea', {
			attr: { placeholder: '输入消息进行讨论...', rows: '2' },
		});
		this.sendBtn = inputArea.createEl('button', { text: '发送' });
		this.sendBtn.addEventListener('click', () => this.handleSend());

		// Allow Ctrl/Cmd+Enter to send
		this.inputEl.addEventListener('keydown', (e) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
				e.preventDefault();
				this.handleSend();
			}
		});

		// Action buttons
		const actions = root.createDiv({ cls: 'aijupyter-chat-actions' });
		this.cancelBtn = actions.createEl('button', { text: '取消', cls: 'aijupyter-chat-cancel-btn' });
		this.confirmBtn = actions.createEl('button', { text: '确认写入', cls: 'aijupyter-chat-confirm-btn' });

		this.confirmBtn.addEventListener('click', () => this.handleConfirm());
		this.cancelBtn.addEventListener('click', () => this.handleCancel());

		this.setInputEnabled(false);
	}

	/**
	 * Start a new generation session. Called by ScaffoldService.
	 */
	startGeneration(params: ChatGenerationParams): void {
		// Reset state
		this.sessionId = '';
		this.latestAssistantContent = '';
		this.isStreaming = false;
		this.currentBubbleEl = null;
		this.currentBubbleContent = '';
		this.onConfirmCallback = params.onConfirm;
		this.claudeService.resetConversation();

		// Update header
		this.headerTitleEl.textContent = params.title;

		// Clear messages
		this.messagesEl.empty();

		// Add a system note about target file
		const noteEl = this.messagesEl.createDiv({ cls: 'aijupyter-chat-note' });
		noteEl.textContent = `目标文件：${params.targetPath}`;

		// Disable input during initial generation
		this.setInputEnabled(false);
		this.confirmBtn.disabled = true;

		// Start streaming
		this.isStreaming = true;
		this.appendAssistantBubble();

		const callbacks: StreamCallbacks = {
			onDelta: (text) => {
				this.appendToCurrentBubble(text);
			},
			onComplete: (result, sid) => {
				this.isStreaming = false;
				this.latestAssistantContent = result;
				this.sessionId = sid;
				this.finalizeBubble();
				this.setInputEnabled(true);
				this.confirmBtn.disabled = false;
			},
			onError: (err) => {
				this.isStreaming = false;
				this.finalizeBubble();
				this.appendErrorMessage(err.message);
				this.setInputEnabled(true);
			},
		};

		this.claudeService.streamPrompt(params.initialPrompt, callbacks);
	}

	private handleSend(): void {
		const text = this.inputEl.value.trim();
		if (!text || this.isStreaming) return;

		// Add user bubble
		this.appendUserBubble(text);
		this.inputEl.value = '';

		// Disable input during streaming
		this.setInputEnabled(false);
		this.confirmBtn.disabled = true;
		this.isStreaming = true;

		// Start new assistant bubble
		this.appendAssistantBubble();

		const callbacks: StreamCallbacks = {
			onDelta: (text) => {
				this.appendToCurrentBubble(text);
			},
			onComplete: (result, sid) => {
				this.isStreaming = false;
				this.latestAssistantContent = result;
				if (sid) this.sessionId = sid;
				this.finalizeBubble();
				this.setInputEnabled(true);
				this.confirmBtn.disabled = false;
			},
			onError: (err) => {
				this.isStreaming = false;
				this.finalizeBubble();
				this.appendErrorMessage(err.message);
				this.setInputEnabled(true);
			},
		};

		this.claudeService.streamContinue(this.sessionId, text, callbacks);
	}

	private async handleConfirm(): Promise<void> {
		if (!this.latestAssistantContent || !this.onConfirmCallback) return;

		this.confirmBtn.disabled = true;
		this.cancelBtn.disabled = true;

		try {
			await this.onConfirmCallback(this.latestAssistantContent);
			this.appendSystemMessage('文档已写入！');
			this.setInputEnabled(false);
		} catch (e) {
			this.appendErrorMessage(`写入失败: ${(e as Error).message}`);
			this.confirmBtn.disabled = false;
			this.cancelBtn.disabled = false;
		}
	}

	private handleCancel(): void {
		this.claudeService.cancelStream();
		this.isStreaming = false;
		this.onConfirmCallback = null;
		this.messagesEl.empty();
		this.headerTitleEl.textContent = 'AiJupyter 对话';
		this.setInputEnabled(false);
		this.confirmBtn.disabled = true;
	}

	private appendUserBubble(text: string): void {
		const bubble = this.messagesEl.createDiv({ cls: 'aijupyter-chat-msg user' });
		bubble.textContent = text;
		this.scrollToBottom();
	}

	private appendAssistantBubble(): void {
		this.currentBubbleEl = this.messagesEl.createDiv({ cls: 'aijupyter-chat-msg assistant' });
		this.currentBubbleContent = '';
		// Add blinking cursor
		this.currentBubbleEl.createSpan({ cls: 'aijupyter-chat-cursor' });
		this.scrollToBottom();
	}

	private appendToCurrentBubble(text: string): void {
		if (!this.currentBubbleEl) return;
		this.currentBubbleContent += text;

		// Re-render the bubble content as plain text during streaming for performance
		// We'll do full markdown render in finalizeBubble()
		this.currentBubbleEl.empty();
		this.currentBubbleEl.textContent = this.currentBubbleContent;
		// Re-add cursor
		this.currentBubbleEl.createSpan({ cls: 'aijupyter-chat-cursor' });
		this.scrollToBottom();
	}

	private async finalizeBubble(): Promise<void> {
		if (!this.currentBubbleEl) return;
		// Remove cursor and render as markdown
		this.currentBubbleEl.empty();

		const contentDiv = this.currentBubbleEl.createDiv();
		try {
			await MarkdownRenderer.render(
				this.app,
				this.currentBubbleContent,
				contentDiv,
				'',
				this
			);
		} catch {
			// Fallback to plain text
			contentDiv.textContent = this.currentBubbleContent;
		}

		this.currentBubbleEl = null;
		this.scrollToBottom();
	}

	private appendErrorMessage(text: string): void {
		const el = this.messagesEl.createDiv({ cls: 'aijupyter-chat-msg error' });
		el.textContent = `错误: ${text}`;
		this.scrollToBottom();
	}

	private appendSystemMessage(text: string): void {
		const el = this.messagesEl.createDiv({ cls: 'aijupyter-chat-msg system' });
		el.textContent = text;
		this.scrollToBottom();
	}

	private scrollToBottom(): void {
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	private setInputEnabled(enabled: boolean): void {
		this.inputEl.disabled = !enabled;
		this.sendBtn.disabled = !enabled;
		if (enabled) {
			this.inputEl.focus();
		}
	}
}
