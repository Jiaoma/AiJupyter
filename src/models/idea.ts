export type IdeaStatus = 'all-pass' | 'has-fail' | 'in-progress' | 'no-tests';

export interface Idea {
	filePath: string;
	name: string;
	keywords: KeywordLink[];
	status: IdeaStatus;
}

export interface KeywordLink {
	originalText: string;
	slug: string;
	displayText: string;
	detailPath: string;
}

export interface AnalysisResult {
	keywords: AnalyzedKeyword[];
}

export interface AnalyzedKeyword {
	original: string;
	slug: string;
	displayText: string;
	detailContent: string;
	testCases: SuggestedTestCase[];
}

export interface SuggestedTestCase {
	name: string;
	input: string;
	expected: string;
	precondition: string;
	steps: string;
}
