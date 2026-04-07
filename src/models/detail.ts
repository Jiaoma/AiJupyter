export type DetailStatus = 'pending' | 'in-progress' | 'done';

export interface Detail {
	filePath: string;
	ideaLink: string;
	slug: string;
	title: string;
	status: DetailStatus;
	sourceQuote: string;
	implementation: string;
	created: string;
	updated: string;
}

export interface DetailFrontmatter {
	idea: string;
	status: DetailStatus;
	created: string;
	updated: string;
}
