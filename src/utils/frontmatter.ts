import { App, TFile } from 'obsidian';

export async function readFrontmatter(app: App, file: TFile): Promise<Record<string, unknown>> {
	const cache = app.metadataCache.getFileCache(file);
	return (cache?.frontmatter as Record<string, unknown>) ?? {};
}

export async function updateFrontmatter(
	app: App,
	file: TFile,
	updates: Record<string, unknown>
): Promise<void> {
	await app.fileManager.processFrontMatter(file, (fm) => {
		for (const [key, value] of Object.entries(updates)) {
			fm[key] = value;
		}
	});
}

export function today(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}
