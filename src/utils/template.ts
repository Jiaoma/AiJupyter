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

// ── Scaffold templates ──

export function renderOverviewTemplate(): string {
	const date = today();
	return `---
type: overview
created: ${date}
updated: ${date}
---

# 项目概览

## 项目名称
（请填写项目名称）

## 项目描述
（请用 2-3 句话描述项目的核心目标和价值）

## 目标用户
（描述目标用户群体及其特征）

## 核心用例

### 用例 1：（用例名称）
- **角色：** （谁在使用）
- **目标：** （想要达成什么）
- **前置条件：** （需要满足什么条件）
- **主要流程：**
  1. （步骤 1）
  2. （步骤 2）
  3. （步骤 3）
- **预期结果：** （完成后的状态）
- **异常流程：** （可能出错的情况及处理方式）

### 用例 2：（用例名称）
- **角色：**
- **目标：**
- **前置条件：**
- **主要流程：**
  1.
- **预期结果：**
- **异常流程：**

## 非功能性需求
- **性能：** （响应时间、吞吐量等要求）
- **安全：** （认证、授权、数据保护等要求）
- **可用性：** （可用性目标，如 99.9%）
- **可维护性：** （代码质量、文档、测试覆盖率等要求）

## 约束与假设
- （列出已知的技术约束、业务约束和假设）

## 风险
| # | 风险描述 | 影响 | 可能性 | 缓解措施 |
|---|----------|------|--------|----------|
| 1 | | | | |
`;
}

export function renderRequirementsTemplate(): string {
	const date = today();
	return `---
type: requirements
created: ${date}
updated: ${date}
---

# 需求列表

## 功能需求

| REQ-ID | 需求描述 | 优先级 | 状态 | 验收标准 |
|--------|----------|--------|------|----------|
| REQ-001 | （需求描述） | P0/P1/P2 | draft | （明确的、可验证的验收条件） |
| REQ-002 | | | draft | |
| REQ-003 | | | draft | |

## 需求详情

### REQ-001：（需求名称）
- **描述：** （详细描述该需求的功能行为）
- **输入：** （该功能接受的输入数据及格式）
- **输出：** （该功能产生的输出数据及格式）
- **业务规则：**
  1. （规则 1）
  2. （规则 2）
- **验收标准：**
  - [ ] （标准 1 — 可验证的条件）
  - [ ] （标准 2）
- **依赖：** （依赖的其他需求或外部系统）
- **备注：** —

### REQ-002：（需求名称）
- **描述：**
- **输入：**
- **输出：**
- **业务规则：**
  1.
- **验收标准：**
  - [ ]
- **依赖：**
- **备注：** —

## 非功能需求

| NFR-ID | 类别 | 描述 | 验收标准 |
|--------|------|------|----------|
| NFR-001 | 性能 | | |
| NFR-002 | 安全 | | |
`;
}

export function renderReqImplMappingTemplate(): string {
	const date = today();
	return `---
type: req-impl-mapping
created: ${date}
updated: ${date}
---

# 需求-实现追踪矩阵

## 映射表

| REQ-ID | 需求摘要 | 实现文档 | 实现状态 | 测试状态 | 备注 |
|--------|----------|----------|----------|----------|------|
| REQ-001 | （摘要） | [[（详细设计文档链接）]] | pending | pending | |
| REQ-002 | | | pending | pending | |

## 状态说明

- **实现状态：** pending → in-progress → done
- **测试状态：** pending → pass / fail

## 覆盖率统计

- 总需求数：0
- 已实现：0（0%）
- 测试通过：0（0%）
- 未开始：0
`;
}

export function renderTestCasesTemplate(): string {
	const date = today();
	return `---
type: test-cases
created: ${date}
updated: ${date}
---

# 测试用例总表

## 用例列表

| TC-ID | 关联需求 | 用例描述 | 前置条件 | 步骤 | 期望结果 | 状态 |
|-------|----------|----------|----------|------|----------|------|
| TC-001 | REQ-001 | （描述） | （前置条件） | （步骤） | （期望结果） | pending |
| TC-002 | | | | | | pending |

## 用例详情

### TC-001：（用例名称）
- **关联需求：** REQ-001
- **类型：** 正常流程 / 边界条件 / 异常流程
- **前置条件：**
  1. （条件 1）
- **步骤：**
  1. （步骤 1）
  2. （步骤 2）
- **期望结果：** （具体、可验证的结果描述）
- **实际结果：** —
- **状态：** pending
- **最后执行：** —

### TC-002：（用例名称）
- **关联需求：**
- **类型：**
- **前置条件：**
  1.
- **步骤：**
  1.
- **期望结果：**
- **实际结果：** —
- **状态：** pending
- **最后执行：** —
`;
}

export function renderChangelogTemplate(): string {
	const date = today();
	return `---
type: changelog
created: ${date}
updated: ${date}
---

# 变更日志

## [Unreleased]

### 新增
-

### 变更
-

### 修复
-

### 删除
-

---

## 变更记录格式说明

每次发布或重大变更使用以下格式记录：

\`\`\`
## [版本号] - YYYY-MM-DD

### 新增
- 新功能描述（关联 REQ-ID）

### 变更
- 修改的功能描述

### 修复
- 修复的 bug 描述

### 删除
- 移除的功能描述
\`\`\`
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
