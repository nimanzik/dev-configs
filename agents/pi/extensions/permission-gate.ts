/**
 * Manual test
 *
 * Start:
 *   pi -e ./permission-gate.ts
 *
 * Ask the agent:
 *   Run the read-only dry-run command `git clean -n -fd` now.
 *
 * Expected:
 *   The permission dialog appears. Denying it blocks the tool call.
 *
 * `-n` makes Git report what it would remove without removing anything.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Risk = {
	label: string;
	detail: string;
};

type CommandRule = Risk & {
	pattern: RegExp;
};

const COMMAND_RULES: CommandRule[] = [
	{
		label: "Recursive deletion",
		detail: "The command can remove files or directories recursively",
		pattern: /\brm\b[^\n;&|]*(?:--recursive\b|-[a-z]*r[a-z]*|-[a-z]*R[a-z]*)/i,
	},
	{
		label: "Elevated privileges",
		detail: "The command can run with administrator privileges",
		pattern: /(^|[;&|]\s*)sudo\b/im,
	},
	{
		label: "Destructive Git operation",
		detail: "The command can discard work, delete untracked files, or rewrite a remote branch",
		pattern:
			/\bgit\s+(?:reset\s+--hard\b|clean\b[^\n;&|]*-[a-z]*f[a-z]*|push\b[^\n;&|]*(?:--force(?:-with-lease)?\b|-f\b)|branch\s+-D\b)/i,
	},
	{
		label: "Broad permission change",
		detail: "The command can make files broadly writable or change ownership recursively",
		pattern: /\b(?:chmod\b[^\n;&|]*(?:-R\b|777\b)|chown\b[^\n;&|]*-R\b)/i,
	},
	{
		label: "Disk or filesystem modification",
		detail: "The command can overwrite a device or destroy filesystem data",
		pattern: /\b(?:mkfs(?:\.[a-z0-9]+)?|wipefs|fdisk|parted)\b|\bdd\b[^\n;&|]*\bof=\/dev\//i,
	},
	{
		label: "System shutdown",
		detail: "The command can stop or restart the machine",
		pattern: /(^|[;&|]\s*)(?:shutdown|reboot|poweroff|halt)\b/im,
	},
	{
		label: "Downloaded code execution",
		detail: "The command downloads content and sends it directly to a shell",
		pattern: /\b(?:curl|wget)\b[^\n]*(?:\||\|&)\s*(?:ba|z|da|fi)?sh\b/i,
	},
];

const SENSITIVE_PATH_PATTERNS: Array<{ pattern: RegExp; risk: Risk }> = [
	{
		pattern: /(^|\/)\.git(?:\/|$)/i,
		risk: {
			label: "Git metadata change",
			detail: "Writing inside '.git' can corrupt the repository or alter its history",
		},
	},
	{
		pattern: /(^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|\.pypirc)$/i,
		risk: {
			label: "Secret-bearing configuration",
			detail: "The target commonly contains credentials or other secrets",
		},
	},
	{
		pattern: /(^|\/)(?:\.ssh|\.aws|\.config\/gcloud)(?:\/|$)/i,
		risk: {
			label: "Credential store change",
			detail: "The target is commonly used to store access credentials",
		},
	},
	{
		pattern: /^(?:\/etc|\/boot|\/dev|\/proc|\/sys)(?:\/|$)/i,
		risk: {
			label: "System path change",
			detail: "The target is part of the operating system",
		},
	},
];

function findCommandRisks(command: string): Risk[] {
	return COMMAND_RULES.filter((rule) => rule.pattern.test(command)).map(({ label, detail }) => ({
		label,
		detail,
	}));
}

function findPathRisks(path: string): Risk[] {
	const normalizedPath = path.replaceAll("\\", "/").replace(/^~\//, "");
	return SENSITIVE_PATH_PATTERNS.filter(({ pattern }) => pattern.test(normalizedPath)).map(
		({ risk }) => risk,
	);
}

function formatPrompt(toolName: string, target: string, risks: Risk[]): string {
	const riskList = risks.map((risk) => `• ${risk.label}: ${risk.detail}`).join("\n");
	return `${riskList}\n\nTool: ${toolName}\nTarget:\n${target}\n\nAllow this tool call?`;
}

export default function guardrailsExtension(pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		let target: string | undefined;
		let risks: Risk[] = [];

		if (event.toolName === "bash") {
			const input = event.input as { command?: unknown };
			if (typeof input.command === "string") {
				target = input.command;
				risks = findCommandRisks(input.command);
			}
		} else if (event.toolName === "write" || event.toolName === "edit") {
			const input = event.input as { path?: unknown };
			if (typeof input.path === "string") {
				target = input.path;
				risks = findPathRisks(input.path);
			}
		}

		if (!target || risks.length === 0) {
			return;
		}

		if (!ctx.hasUI) {
			return {
				block: true,
				reason: `Guardrails blocked '${event.toolName}' because confirmation is unavailable`,
			};
		}

		const confirmed = await ctx.ui.confirm(
			"Permission required",
			formatPrompt(event.toolName, target, risks),
		);

		if (!confirmed) {
			return {
				block: true,
				reason: `User denied dangerous '${event.toolName}' tool call`,
			};
		}
	});
}
