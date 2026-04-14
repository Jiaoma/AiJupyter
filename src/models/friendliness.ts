export type UnfriendlyCategory = 'ambiguous' | 'vague' | 'no-criteria' | 'imprecise';

export interface UnfriendlySpan {
	text: string;
	category: UnfriendlyCategory;
	suggestion: string;
}

export interface FriendlinessResult {
	filePath: string;
	spans: UnfriendlySpan[];
}
