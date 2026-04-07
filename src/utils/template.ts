import { today } from './frontmatter';
import type { SuggestedTestCase } from '../models/idea';

export function renderDetailTemplate(params: {
	ideaFileName: string;
	title: string;
	sourceQuote: string;
	implementation: string;
}): string {
	const date = today();
	return `---
idea: "[[${params.ideaFileName}]]"
status: pending
created: ${date}
updated: ${date}
---

# ${params.title}

## 来源
> ${params.sourceQuote}

## 实现方案
${params.implementation}

## 关联 Diff
| # | 描述 | 日期 | 链接 |
|---|------|------|------|

## 关联用例
| # | 用例名称 | 状态 | 链接 |
|---|----------|------|------|
`;
}

export function renderTestTemplate(params: {
	detailFileName: string;
	title: string;
	testCases: SuggestedTestCase[];
}): string {
	const date = today();
	const rows = params.testCases
		.map((tc, i) => `| ${i + 1} | ${tc.name} | ${tc.input} | ${tc.expected} | — | pending | — |`)
		.join('\n');

	const details = params.testCases
		.map(
			(tc, i) => `### 用例 ${i + 1}: ${tc.name}
- **前置条件:** ${tc.precondition || '—'}
- **步骤:** ${tc.steps || '—'}
- **期望:** ${tc.expected}
- **备注:** —`
		)
		.join('\n\n');

	return `---
detail: "[[${params.detailFileName}]]"
created: ${date}
updated: ${date}
---

# 用例: ${params.title}

## 用例列表

| # | 用例 | 输入 | 期望结果 | 实际结果 | 状态 | 最后执行 |
|---|------|------|----------|----------|------|----------|
${rows}

## 用例详情

${details}
`;
}

export function renderDiffTemplate(params: {
	detailFileName: string;
	title: string;
	commit: string;
	description: string;
	changedFiles: { path: string; changeType: string }[];
	diffContent: string;
}): string {
	const date = today();
	const files = params.changedFiles
		.map((f) => `- \`${f.path}\` (${f.changeType})`)
		.join('\n');

	return `---
detail: "[[${params.detailFileName}]]"
created: ${date}
commit: ${params.commit}
---

# Diff: ${params.title} — ${params.description}

## 变更文件
${files}

## Diff 内容

\`\`\`diff
${params.diffContent}
\`\`\`
`;
}
