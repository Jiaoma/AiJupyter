import { App, MarkdownPostProcessorComponent } from 'obsidian';
import type { AiJupyterSettings } from '../settings-data';
import type { FriendlinessService } from '../services/friendliness-service';
import type { UnfriendlySpan } from '../models/friendliness';

export class FriendlinessProcessor {
	private app: App;
	private settings: AiJupyterSettings;
	private friendlinessService: FriendlinessService;

	constructor(app: App, settings: AiJupyterSettings, friendlinessService: FriendlinessService) {
		this.app = app;
		this.settings = settings;
		this.friendlinessService = friendlinessService;
	}

	updateSettings(settings: AiJupyterSettings): void {
		this.settings = settings;
	}

	getProcessor(): (el: HTMLElement, ctx: MarkdownPostProcessorComponent) => void {
		return (el: HTMLElement, ctx: MarkdownPostProcessorComponent) => {
			if (!this.settings.enableFriendlinessHighlight) return;

			const filePath = ctx.sourcePath;
			const result = this.friendlinessService.getCached(filePath);
			if (!result || !result.spans.length) return;

			this.highlightSpans(el, result.spans);
		};
	}

	private highlightSpans(el: HTMLElement, spans: UnfriendlySpan[]): void {
		// Walk all text nodes in the element
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		const textNodes: Text[] = [];
		let node: Text | null;
		while ((node = walker.nextNode() as Text | null)) {
			textNodes.push(node);
		}

		for (const span of spans) {
			for (const textNode of textNodes) {
				const text = textNode.textContent || '';
				const idx = text.indexOf(span.text);
				if (idx === -1) continue;

				// Split the text node at the match boundaries
				const before = text.slice(0, idx);
				const match = span.text;
				const after = text.slice(idx + match.length);

				const parent = textNode.parentNode;
				if (!parent) continue;

				// Create the highlight span element
				const highlightEl = document.createElement('span');
				highlightEl.className = `aijupyter-unfriendly aijupyter-unfriendly-${span.category}`;
				highlightEl.textContent = match;
				highlightEl.setAttribute('title', `[${span.category}] ${span.suggestion}`);

				// Replace the text node with before + highlight + after
				if (before) {
					parent.insertBefore(document.createTextNode(before), textNode);
				}
				parent.insertBefore(highlightEl, textNode);
				if (after) {
					parent.insertBefore(document.createTextNode(after), textNode);
				}
				parent.removeChild(textNode);

				// Only highlight the first occurrence per span per element
				break;
			}
		}
	}
}
