export type TestStatus = 'pass' | 'fail' | 'pending';

export interface TestCase {
	id: number;
	name: string;
	input: string;
	expected: string;
	actual: string;
	status: TestStatus;
	lastRun: string;
	precondition: string;
	steps: string;
	notes: string;
}

export interface TestDocument {
	filePath: string;
	detailLink: string;
	title: string;
	testCases: TestCase[];
	created: string;
	updated: string;
}

export interface TestFrontmatter {
	detail: string;
	created: string;
	updated: string;
}
