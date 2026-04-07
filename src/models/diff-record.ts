export interface DiffRecord {
	filePath: string;
	detailLink: string;
	commit: string;
	description: string;
	created: string;
	changedFiles: ChangedFile[];
	diffContent: string;
}

export interface ChangedFile {
	path: string;
	changeType: 'added' | 'modified' | 'deleted' | 'renamed';
}

export interface DiffFrontmatter {
	detail: string;
	created: string;
	commit: string;
}
