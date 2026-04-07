import type { ShellType } from '../settings-data';
import { shellExec } from './shell-env';

export interface GitDiffResult {
	commit: string;
	message: string;
	files: { path: string; changeType: 'added' | 'modified' | 'deleted' | 'renamed' }[];
	diff: string;
}

export async function runGitCommand(
	cwd: string,
	args: string,
	shell: ShellType = '/bin/zsh',
	extraPath = ''
): Promise<string> {
	const { stdout } = await shellExec(`git ${args}`, shell, extraPath, { cwd });
	return stdout.trim();
}

export async function getLatestCommitHash(cwd: string, shell?: ShellType, extraPath?: string): Promise<string> {
	return runGitCommand(cwd, 'rev-parse HEAD', shell, extraPath);
}

export async function getCommitDiff(cwd: string, commitHash: string, shell?: ShellType, extraPath?: string): Promise<GitDiffResult> {
	const [message, diffNameStatus, diffContent] = await Promise.all([
		runGitCommand(cwd, `log -1 --pretty=%B ${commitHash}`, shell, extraPath),
		runGitCommand(cwd, `diff-tree --no-commit-id -r --name-status ${commitHash}`, shell, extraPath),
		runGitCommand(cwd, `show ${commitHash} --format="" --patch`, shell, extraPath),
	]);

	const files = diffNameStatus
		.split('\n')
		.filter((l) => l.trim())
		.map((line) => {
			const [status, ...pathParts] = line.split('\t');
			const path = pathParts.join('\t');
			let changeType: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified';
			if (status.startsWith('A')) changeType = 'added';
			else if (status.startsWith('D')) changeType = 'deleted';
			else if (status.startsWith('R')) changeType = 'renamed';
			return { path, changeType };
		});

	return { commit: commitHash, message, files, diff: diffContent };
}

export async function getUncommittedDiff(cwd: string, shell?: ShellType, extraPath?: string): Promise<string> {
	const staged = await runGitCommand(cwd, 'diff --cached', shell, extraPath);
	const unstaged = await runGitCommand(cwd, 'diff', shell, extraPath);
	return [staged, unstaged].filter(Boolean).join('\n');
}

export async function getRepoRoot(cwd: string, shell?: ShellType, extraPath?: string): Promise<string | null> {
	try {
		return await runGitCommand(cwd, 'rev-parse --show-toplevel', shell, extraPath);
	} catch {
		return null;
	}
}
