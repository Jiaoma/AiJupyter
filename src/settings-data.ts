export type ShellType = '/bin/zsh' | '/bin/bash' | '/bin/sh';

export interface AiJupyterSettings {
	ideasFolder: string;
	detailsFolder: string;
	diffsFolder: string;
	testsFolder: string;
	shell: ShellType;
	extraPath: string;
	claudeMode: 'cli' | 'api';
	apiKey: string;
	model: string;
	autoLinkOnSave: boolean;
	autoTrackDiffs: boolean;
	autoRunTests: boolean;
	testCommand: string;
	enableStatusColors: boolean;
	showBreadcrumbs: boolean;
	showSidePanel: boolean;
}

export const DEFAULT_SETTINGS: AiJupyterSettings = {
	ideasFolder: 'ideas',
	detailsFolder: 'details',
	diffsFolder: 'diffs',
	testsFolder: 'tests',
	shell: '/bin/zsh',
	extraPath: '',
	claudeMode: 'cli',
	apiKey: '',
	model: 'claude-sonnet-4-6',
	autoLinkOnSave: false,
	autoTrackDiffs: true,
	autoRunTests: false,
	testCommand: 'npm test',
	enableStatusColors: true,
	showBreadcrumbs: true,
	showSidePanel: true,
};
