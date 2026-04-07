import { exec } from 'child_process';
import type { ShellType } from '../settings-data';

let cachedEnv: NodeJS.ProcessEnv | null = null;
let cachedShell: ShellType | null = null;

/**
 * Resolve the user's full login-shell environment.
 *
 * Obsidian (Electron) is launched by macOS as a GUI app, so it inherits the
 * system-level environment — NOT the user's terminal environment. Tools like
 * `claude`, `node`, `npm`, `nvm`, `brew` etc. are typically added to PATH
 * inside `.zshrc` / `.zprofile` / `.bashrc` / `.bash_profile`, which are
 * only sourced by a login or interactive shell.
 *
 * This function spawns a one-shot login shell (`-l -i -c`) to capture the
 * full env, then caches it for the lifetime of the plugin.
 */
export async function resolveLoginEnv(shell: ShellType): Promise<NodeJS.ProcessEnv> {
	if (cachedEnv && cachedShell === shell) return cachedEnv;

	const env = await new Promise<NodeJS.ProcessEnv>((resolve) => {
		const marker = `__AIJUPYTER_ENV_${Date.now()}__`;
		const cmd = `${shell} -l -i -c 'echo ${marker} && env'`;

		exec(cmd, { timeout: 10000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
			if (err || !stdout) {
				resolve({ ...process.env });
				return;
			}

			const markerIdx = stdout.indexOf(marker);
			const envBlock = markerIdx >= 0
				? stdout.slice(markerIdx + marker.length + 1)
				: stdout;

			const env: NodeJS.ProcessEnv = { ...process.env };

			for (const line of envBlock.split('\n')) {
				const eqIdx = line.indexOf('=');
				if (eqIdx > 0) {
					const key = line.slice(0, eqIdx);
					const value = line.slice(eqIdx + 1);
					env[key] = value;
				}
			}

			resolve(env);
		});
	});

	cachedEnv = env;
	cachedShell = shell;
	return env;
}

/**
 * Build the final env for exec calls, merging login env + user's extraPath.
 */
export function buildExecEnv(loginEnv: NodeJS.ProcessEnv, extraPath: string): NodeJS.ProcessEnv {
	if (!extraPath) return loginEnv;

	const currentPath = loginEnv['PATH'] || '';
	return {
		...loginEnv,
		PATH: `${extraPath}:${currentPath}`,
	};
}

export interface ExecOptions {
	cwd?: string;
	timeout?: number;
	maxBuffer?: number;
}

/**
 * Central exec wrapper used by ALL services. Automatically injects:
 * - The user's configured shell
 * - The full login-shell environment (resolved & cached)
 * - Any extra PATH from settings
 */
export async function shellExec(
	command: string,
	shell: ShellType,
	extraPath: string,
	opts: ExecOptions = {}
): Promise<{ stdout: string; stderr: string }> {
	const loginEnv = await resolveLoginEnv(shell);
	const env = buildExecEnv(loginEnv, extraPath);

	return new Promise((resolve, reject) => {
		exec(command, {
			shell,
			env,
			cwd: opts.cwd,
			timeout: opts.timeout ?? 120000,
			maxBuffer: opts.maxBuffer ?? 1024 * 1024 * 10,
		}, (err, stdout, stderr) => {
			if (err) {
				reject(Object.assign(err, { stdout, stderr }));
			} else {
				resolve({ stdout, stderr });
			}
		});
	});
}

/**
 * Clear the cached environment. Call when the user changes shell settings.
 */
export function clearEnvCache(): void {
	cachedEnv = null;
	cachedShell = null;
}
