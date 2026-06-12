/**
 * SSH Remote Execution Example
 *
 * Demonstrates delegating tool operations to a remote machine via SSH.
 * When --ssh is provided, read/write/edit/bash run on the remote.
 *
 * Usage:
 *   pi -e ./ssh.ts --ssh user@host
 *   pi -e ./ssh.ts --ssh user@host:/remote/path
 *
 * Requirements:
 *   - SSH key-based auth (no password prompts)
 *   - bash on remote
 */

import { spawn } from "node:child_process";
import { basename } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem, AutocompleteProvider } from "@earendil-works/pi-tui";
import {
	type BashOperations,
	createBashTool,
	createEditTool,
	createReadTool,
	createWriteTool,
	type EditOperations,
	type ReadOperations,
	type WriteOperations,
} from "@earendil-works/pi-coding-agent";

function shellSingleQuote(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function sshExec(remote: string, command: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const remoteCmd = `/bin/bash -lc ${shellSingleQuote(command)}`;
		const child = spawn("ssh", [remote, remoteCmd], { stdio: ["ignore", "pipe", "pipe"] });
		const chunks: Buffer[] = [];
		const errChunks: Buffer[] = [];
		child.stdout.on("data", (data) => chunks.push(data));
		child.stderr.on("data", (data) => errChunks.push(data));
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`SSH failed (${code}): ${Buffer.concat(errChunks).toString()}`));
			} else {
				resolve(Buffer.concat(chunks));
			}
		});
	});
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFdPathQuery(query: string): string {
	const normalized = query.replace(/\\/g, "/");
	if (!normalized.includes("/")) return normalized;

	const hasTrailingSeparator = normalized.endsWith("/");
	const segments = normalized
		.replace(/^\/+|\/+$/g, "")
		.split("/")
		.filter(Boolean)
		.map((segment) => escapeRegex(segment));

	if (segments.length === 0) return normalized;
	return `${segments.join("[\\\\/]")}${hasTrailingSeparator ? "[\\\\/]" : ""}`;
}

function fuzzyScore(path: string, query: string, isDirectory: boolean): number {
	if (!query) return isDirectory ? 2 : 1;

	const name = basename(path).toLowerCase();
	const lowerPath = path.toLowerCase();
	const lowerQuery = query.toLowerCase();
	let score = 0;

	if (name === lowerQuery) score = 100;
	else if (name.startsWith(lowerQuery)) score = 80;
	else if (name.includes(lowerQuery)) score = 50;
	else if (lowerPath.includes(lowerQuery)) score = 30;

	return isDirectory && score > 0 ? score + 10 : score;
}

function extractAtPrefix(text: string): string | null {
	const quotedMatch = /(^|[\s=])@"[^"]*$/.exec(text);
	if (quotedMatch) return text.slice((quotedMatch.index ?? 0) + quotedMatch[1].length);

	const delimiter = Math.max(text.lastIndexOf(" "), text.lastIndexOf("\t"), text.lastIndexOf("\""), text.lastIndexOf("'"), text.lastIndexOf("="));
	const token = text.slice(delimiter + 1);
	return token.startsWith("@") ? token : null;
}

async function getRemoteFileSuggestions(
	remote: string,
	remoteCwd: string,
	query: string,
	isQuotedPrefix: boolean,
): Promise<AutocompleteItem[]> {
	const fdQuery = buildFdPathQuery(query);
	const fdArgs = [
		"--max-results 100",
		"--type f",
		"--type d",
		"--follow",
		"--hidden",
		"--exclude .git",
	];
	if (query.includes("/")) fdArgs.push("--full-path");
	if (fdQuery) fdArgs.push(shellSingleQuote(fdQuery));

	const command = `
		cd ${shellSingleQuote(remoteCwd)} || exit 1
		fd_bin=$(command -v fd || command -v fdfind || true)
		if [ -n "$fd_bin" ]; then
			"$fd_bin" ${fdArgs.join(" ")} | while IFS= read -r p; do
				[ -z "$p" ] && continue
				if [ -d "$p" ]; then printf 'd\\t%s\\n' "$p"; else printf 'f\\t%s\\n' "$p"; fi
			done
		else
			find . -path './.git' -prune -o \\( -type f -o -type d \\) -printf '%y\\t%P\\n' 2>/dev/null | head -n 5000
		fi
	`;

	const output = (await sshExec(remote, command)).toString();
	const rawQuery = query.split("/").pop() ?? query;
	const suggestions = output
		.split("\n")
		.map((line) => {
			const tab = line.indexOf("\t");
			if (tab === -1) return null;
			const type = line.slice(0, tab);
			const path = line.slice(tab + 1).replace(/^\.\//, "");
			if (!path || path === ".git" || path.startsWith(".git/")) return null;
			const isDirectory = type === "d";
			const score = fuzzyScore(path, rawQuery, isDirectory);
			return score > 0 ? { path, isDirectory, score } : null;
		})
		.filter((entry): entry is { path: string; isDirectory: boolean; score: number } => entry !== null)
		.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
		.slice(0, 20);

	return suggestions.map(({ path, isDirectory }) => {
		const displayPath = `${path}${isDirectory ? "/" : ""}`;
		const needsQuotes = isQuotedPrefix || displayPath.includes(" ");
		const value = needsQuotes ? `@"${displayPath}"` : `@${displayPath}`;
		return {
			value,
			label: `${basename(path)}${isDirectory ? "/" : ""}`,
			description: displayPath,
		};
	});
}

function createRemoteAutocompleteProvider(remote: string, remoteCwd: string, current: AutocompleteProvider): AutocompleteProvider {
	return {
		...current,
		triggerCharacters: [...new Set([...(current.triggerCharacters ?? []), "@"])],
		async getSuggestions(lines, cursorLine, cursorCol, options) {
			const currentLine = lines[cursorLine] ?? "";
			const textBeforeCursor = currentLine.slice(0, cursorCol);
			const atPrefix = extractAtPrefix(textBeforeCursor);
			if (!atPrefix) return current.getSuggestions(lines, cursorLine, cursorCol, options);

			try {
				const isQuotedPrefix = atPrefix.startsWith('@"');
				const query = isQuotedPrefix ? atPrefix.slice(2) : atPrefix.slice(1);
				const items = await getRemoteFileSuggestions(remote, remoteCwd, query, isQuotedPrefix);
				return items.length > 0 ? { items, prefix: atPrefix } : null;
			} catch {
				return null;
			}
		},
		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		},
		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	};
}

function createRemoteReadOps(remote: string, remoteCwd: string, localCwd: string): ReadOperations {
	const toRemote = (p: string) => p.replace(localCwd, remoteCwd);
	return {
		readFile: (p) => sshExec(remote, `cat ${JSON.stringify(toRemote(p))}`),
		access: (p) => sshExec(remote, `test -r ${JSON.stringify(toRemote(p))}`).then(() => {}),
		detectImageMimeType: async (p) => {
			try {
				const r = await sshExec(remote, `file --mime-type -b ${JSON.stringify(toRemote(p))}`);
				const m = r.toString().trim();
				return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(m) ? m : null;
			} catch {
				return null;
			}
		},
	};
}

function createRemoteWriteOps(remote: string, remoteCwd: string, localCwd: string): WriteOperations {
	const toRemote = (p: string) => p.replace(localCwd, remoteCwd);
	return {
		writeFile: async (p, content) => {
			const b64 = Buffer.from(content).toString("base64");
			await sshExec(remote, `echo ${JSON.stringify(b64)} | base64 -d > ${JSON.stringify(toRemote(p))}`);
		},
		mkdir: (dir) => sshExec(remote, `mkdir -p ${JSON.stringify(toRemote(dir))}`).then(() => {}),
	};
}

function createRemoteEditOps(remote: string, remoteCwd: string, localCwd: string): EditOperations {
	const r = createRemoteReadOps(remote, remoteCwd, localCwd);
	const w = createRemoteWriteOps(remote, remoteCwd, localCwd);
	return { readFile: r.readFile, access: r.access, writeFile: w.writeFile };
}

function createRemoteBashOps(remote: string, remoteCwd: string, localCwd: string): BashOperations {
	const toRemote = (p: string) => p.replace(localCwd, remoteCwd);
	return {
		exec: (command, cwd, { onData, signal, timeout }) =>
			new Promise((resolve, reject) => {
				const cmd = `cd ${JSON.stringify(toRemote(cwd))} && ${command}`;
				const remoteCmd = `/bin/bash -lc ${shellSingleQuote(cmd)}`;
				const child = spawn("ssh", [remote, remoteCmd], { stdio: ["ignore", "pipe", "pipe"] });
				let timedOut = false;
				const timer = timeout
					? setTimeout(() => {
							timedOut = true;
							child.kill();
						}, timeout * 1000)
					: undefined;
				child.stdout.on("data", onData);
				child.stderr.on("data", onData);
				child.on("error", (e) => {
					if (timer) clearTimeout(timer);
					reject(e);
				});
				const onAbort = () => child.kill();
				signal?.addEventListener("abort", onAbort, { once: true });
				child.on("close", (code) => {
					if (timer) clearTimeout(timer);
					signal?.removeEventListener("abort", onAbort);
					if (signal?.aborted) reject(new Error("aborted"));
					else if (timedOut) reject(new Error(`timeout:${timeout}`));
					else resolve({ exitCode: code });
				});
			}),
	};
}

export default function (pi: ExtensionAPI) {
	pi.registerFlag("ssh", { description: "SSH remote: user@host or user@host:/path", type: "string" });

	const localCwd = process.cwd();
	const localRead = createReadTool(localCwd);
	const localWrite = createWriteTool(localCwd);
	const localEdit = createEditTool(localCwd);
	const localBash = createBashTool(localCwd);

	// Resolved lazily on session_start (CLI flags not available during factory)
	let resolvedSsh: { remote: string; remoteCwd: string } | null = null;

	const getSsh = () => resolvedSsh;

	pi.registerTool({
		...localRead,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = getSsh();
			if (ssh) {
				const tool = createReadTool(localCwd, {
					operations: createRemoteReadOps(ssh.remote, ssh.remoteCwd, localCwd),
				});
				return tool.execute(id, params, signal, onUpdate);
			}
			return localRead.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localWrite,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = getSsh();
			if (ssh) {
				const tool = createWriteTool(localCwd, {
					operations: createRemoteWriteOps(ssh.remote, ssh.remoteCwd, localCwd),
				});
				return tool.execute(id, params, signal, onUpdate);
			}
			return localWrite.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localEdit,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = getSsh();
			if (ssh) {
				const tool = createEditTool(localCwd, {
					operations: createRemoteEditOps(ssh.remote, ssh.remoteCwd, localCwd),
				});
				return tool.execute(id, params, signal, onUpdate);
			}
			return localEdit.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localBash,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = getSsh();
			if (ssh) {
				const tool = createBashTool(localCwd, {
					operations: createRemoteBashOps(ssh.remote, ssh.remoteCwd, localCwd),
				});
				return tool.execute(id, params, signal, onUpdate);
			}
			return localBash.execute(id, params, signal, onUpdate);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		// Resolve SSH config now that CLI flags are available
		const arg = pi.getFlag("ssh") as string | undefined;
		if (arg) {
			if (arg.includes(":")) {
				const [remote, path] = arg.split(":");
				resolvedSsh = { remote, remoteCwd: path };
			} else {
				// No path given, evaluate pwd on remote
				const remote = arg;
				const pwd = (await sshExec(remote, "pwd")).toString().trim();
				resolvedSsh = { remote, remoteCwd: pwd };
			}
			ctx.ui.setStatus("ssh", ctx.ui.theme.fg("accent", `SSH: ${resolvedSsh.remote}:${resolvedSsh.remoteCwd}`));
			ctx.ui.addAutocompleteProvider((current) =>
				createRemoteAutocompleteProvider(resolvedSsh!.remote, resolvedSsh!.remoteCwd, current),
			);
			ctx.ui.notify(`SSH mode: ${resolvedSsh.remote}:${resolvedSsh.remoteCwd}`, "info");
		}
	});

	// Handle user ! commands via SSH
	pi.on("user_bash", (_event) => {
		const ssh = getSsh();
		if (!ssh) return; // No SSH, use local execution
		return { operations: createRemoteBashOps(ssh.remote, ssh.remoteCwd, localCwd) };
	});

	// Replace local cwd with remote cwd in system prompt
	pi.on("before_agent_start", async (event) => {
		const ssh = getSsh();
		if (ssh) {
			const modified = event.systemPrompt.replace(
				`Current working directory: ${localCwd}`,
				`Current working directory: ${ssh.remoteCwd} (via SSH: ${ssh.remote})`,
			);
			return { systemPrompt: modified };
		}
	});
}
