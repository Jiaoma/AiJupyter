# AiJupyter — Obsidian 想法追踪插件 Spec

## 1. Overview

一个 Obsidian 插件，将人类的顶层想法描述转化为可遍历的文档树。核心流程：

```
人类想法 (顶层文档)
  └── 关键语句 → [[详细设计子文档]]
        ├── 代码实现 diff 记录
        ├── 用例设计
        └── 用例执行结果
```

人类只需写自然语言的想法描述，Claude Code 负责：
- 识别关键语句并转化为 `[[wiki-link]]`
- 生成对应的子文档骨架
- 关联 diff、用例及执行状态
- 当某想法的所有用例通过时，自动标记绿色背景

---

## 2. 核心概念

### 2.1 文档层级

| 层级 | 名称 | 作者 | 内容 |
|------|------|------|------|
| L0 | 顶层想法文档 | 人类 | 自然语言描述的想法/需求 |
| L1 | 详细设计文档 | Claude Code 生成，人类可编辑 | 某个关键语句的详细实现方案 |
| L2 | Diff 记录文档 | Claude Code 自动生成 | 代码变更的具体 diff |
| L2 | 用例文档 | Claude Code 生成，人类可编辑 | 测试用例设计及执行结果 |

### 2.2 Vault 目录结构

项目采用关注点分离的目录布局：`ideas/` 存放设计文档，`src/` 存放代码实现，其余目录（`details/`、`tests/`、`diffs/`、`logs/`）均在 vault 根目录下与它们同级：

```
vault/
├── ideas/                         # L0 顶层想法 & 设计文档
│   ├── obsidian-idea-tracker-plugin-spec.md
│   ├── idea-auth-system.md
│   └── idea-data-pipeline.md
├── src/                           # 插件代码实现
│   ├── main.ts
│   ├── services/
│   ├── views/
│   ├── models/
│   └── utils/
├── details/                       # L1 详细设计文档
│   ├── auth-system/
│   │   ├── jwt-token-validation.md
│   │   └── oauth2-integration.md
│   └── data-pipeline/
│       └── stream-processing.md
├── diffs/                         # L2 Diff 记录
│   ├── auth-system/
│   │   └── jwt-token-validation-diff-001.md
│   └── ...
├── tests/                         # L2 用例文档
│   ├── auth-system/
│   │   ├── jwt-token-validation-tests.md
│   │   └── ...
│   └── ...
└── logs/                          # 操作日志
    ├── 2026-04-11-14-30-05-识别关键语句-idea-auth-system.md
    └── ...
```

---

## 3. 功能规格

### 3.1 关键语句识别与链接化

**触发方式：** 命令面板 `AiJupyter: Link Keywords - 识别关键语句并转化为链接` 或保存时自动触发（可配置）

> **自动触发行为：** 启用 `autoLinkOnSave` 后，仅对 `ideas/` 目录下的 `.md` 文件生效。`details/`、`diffs/`、`tests/`、`logs/` 等目录为独立同级目录，不会被误触发。采用 2 秒 debounce — 连续编辑时只在最后一次修改后 2 秒触发，且前一次运行未完成时跳过新的触发。

**行为：**

1. 读取当前 L0 文档的自然语言内容（自动剥离 frontmatter）
2. 显示进度条（不确定模式 — 脉冲动画），状态文字："正在调用 Claude 分析关键语句..."
3. 调用 Claude Code 识别其中的关键实现语句
4. 将关键语句转化为 Obsidian wiki-link，例如：

**转化前：**
```markdown
用户登录时需要进行 JWT token 验证，验证通过后建立会话。
同时需要支持 OAuth2 第三方登录集成。
```

**转化后：**
```markdown
用户登录时需要进行 [[jwt-token-validation|JWT token 验证]]，验证通过后建立会话。
同时需要支持 [[oauth2-integration|OAuth2 第三方登录集成]]。
```

5. 切换进度条为确定模式，逐步生成子文档（显示 "生成文档 1/N"、"生成文档 2/N"...），右上角显示已用时间
6. 自动在 `details/` 和 `tests/` 下创建对应子文档
7. 操作全过程记录到 `logs/` 下的日志文件

### 3.2 进度指示

文档生成过程中，通过 Obsidian Notice 显示一个持久化的进度面板：

```
┌──────────────────────────────────┐
│ 文档生成中                   12s  │  ← 标题 + 已用时间（每秒更新）
│ 正在生成：jwt-token-validation   │  ← 当前操作状态文字
│ ████████████░░░░░░░░░░░░░░░░░░░ │  ← 进度条（确定/不确定两种模式）
│ 2 / 5                            │  ← 步骤计数
└──────────────────────────────────┘
```

**两种模式：**

| 模式 | 使用场景 | 表现 |
|------|----------|------|
| 不确定模式 | Claude API 调用等无法预知时长的操作 | 脉冲动画 + 状态文字 |
| 确定模式 | 子文档逐个生成 | 百分比进度条 + 步骤计数 + 状态文字 |

### 3.3 操作日志

每次操作自动生成一份 Markdown 日志文件，存放于 `logs/` 目录，文件名格式 `YYYY-MM-DD-HH-mm-ss-操作名.md`。

**日志文件结构：**

```markdown
# 操作日志：识别关键语句 - idea-auth-system

- **开始时间**：2026-04-11 14:30:05
- **耗时**：8.3s
- **条目数**：12

## 详细记录

- `+0ms` ℹ 开始分析文档：ideas/idea-auth-system.md
- `+5.2s` ℹ Claude 分析完成，识别到 3 个关键语句
- `+5.2s` ✓ 插入链接：[[jwt-token-validation|JWT Token 校验]]
- `+5.3s` ✓ 创建详细设计文档：details/auth-system/jwt-token-validation.md
- `+5.4s` ✓ 创建测试用例文档：tests/auth-system/jwt-token-validation-tests.md
- `+7.1s` ℹ 跳过（已存在）：details/auth-system/oauth2-integration.md
- `+8.3s` ✓ 子文档生成完成，共处理 3 个关键语句
```

**日志级别：**

| 级别 | 前缀 | 含义 |
|------|------|------|
| info | ℹ | 一般操作信息 |
| success | ✓ | 操作成功完成 |
| warn | ⚠ | 警告（如跳过、部分失败） |
| error | ✗ | 操作失败 |

**覆盖的操作类型：** 识别关键语句、生成详细设计、记录 Git Diff（手动/自动）、执行测试用例

### 3.4 详细设计文档（L1）

由 Claude Code 生成的子文档包含以下结构：

```markdown
---
idea: "[[idea-auth-system]]"
status: in-progress    # pending | in-progress | done
created: 2026-04-07
updated: 2026-04-07
---

# JWT Token 验证

## 来源
> 用户登录时需要进行 JWT token 验证，验证通过后建立会话。

## 实现方案
（Claude Code 生成的详细技术方案）

## 关联 Diff
| # | 描述 | 日期 | 链接 |
|---|------|------|------|
| 1 | 初始实现 | 2026-04-07 | [[jwt-token-validation-diff-001]] |

## 关联用例
| # | 用例名称 | 状态 | 链接 |
|---|----------|------|------|
| 1 | 合法 token 验证通过 | pass | [[jwt-validation-test-001]] |
| 2 | 过期 token 拒绝 | fail | [[jwt-validation-test-002]] |
```

### 3.5 Diff 记录文档（L2）

每次 Claude Code 修改代码后，自动生成 diff 记录：

```markdown
---
detail: "[[jwt-token-validation]]"
created: 2026-04-07
commit: abc1234
---

# Diff: JWT Token 验证 — 初始实现

## 变更文件
- `src/auth/jwt.ts` (新增)
- `src/middleware/auth.ts` (修改)

## Diff 内容

### src/auth/jwt.ts (新增)
\```diff
+ import jwt from 'jsonwebtoken';
+
+ export function validateToken(token: string): boolean {
+   try {
+     jwt.verify(token, process.env.JWT_SECRET);
+     return true;
+   } catch {
+     return false;
+   }
+ }
\```

### src/middleware/auth.ts (修改)
\```diff
  import { Request, Response, NextFunction } from 'express';
+ import { validateToken } from '../auth/jwt';

  export function authMiddleware(req: Request, res: Response, next: NextFunction) {
-   // TODO: implement auth
-   next();
+   const token = req.headers.authorization?.split(' ')[1];
+   if (!token || !validateToken(token)) {
+     return res.status(401).json({ error: 'Unauthorized' });
+   }
+   next();
  }
\```
```

### 3.6 用例文档（L2）

```markdown
---
detail: "[[jwt-token-validation]]"
created: 2026-04-07
updated: 2026-04-07
---

# 用例: JWT Token 验证

## 用例列表

| # | 用例 | 输入 | 期望结果 | 实际结果 | 状态 | 最后执行 |
|---|------|------|----------|----------|------|----------|
| 1 | 合法 token 验证通过 | 有效 JWT | 返回 true | 返回 true | pass | 2026-04-07 |
| 2 | 过期 token 被拒绝 | 过期 JWT | 返回 false | 抛出异常 | fail | 2026-04-07 |
| 3 | 空 token 被拒绝 | null | 返回 false | — | pending | — |

## 用例详情

### 用例 1: 合法 token 验证通过
- **前置条件:** JWT_SECRET 已配置
- **步骤:** 调用 `validateToken()` 传入有效 token
- **期望:** 返回 `true`
- **备注:** —
```

### 3.7 状态着色

**核心规则：** 当一个 L0 想法文档关联的所有用例全部为 `pass` 状态时，该想法在文档中以绿色背景呈现。

**状态定义：**

| 状态 | 含义 | 颜色 |
|------|------|------|
| all-pass | 所有关联用例通过 | 绿色背景 `#d4edda` |
| has-fail | 存在失败用例 | 红色背景 `#f8d7da` |
| in-progress | 存在 pending 用例 | 黄色背景 `#fff3cd` |
| no-tests | 尚无用例 | 无特殊颜色 |

**实现方式：** 通过 `MarkdownPostProcessor` 在阅读模式下自动解析 L0 文档中的 wiki-link，查询关联用例状态，注入对应 CSS class：

```css
.aijupyter-status-all-pass {
  background-color: #d4edda;
  border-left: 4px solid #28a745;
  padding: 2px 6px;
  border-radius: 3px;
}

.aijupyter-status-has-fail {
  background-color: #f8d7da;
  border-left: 4px solid #dc3545;
  padding: 2px 6px;
  border-radius: 3px;
}

.aijupyter-status-in-progress {
  background-color: #fff3cd;
  border-left: 4px solid #ffc107;
  padding: 2px 6px;
  border-radius: 3px;
}
```

### 3.8 导航与遍历

插件提供从顶层文档出发的完整遍历路径：

```
L0: idea-auth-system.md
 ├─ 点击 [[jwt-token-validation]] → L1 详细设计
 │   ├─ 点击 [[jwt-token-validation-diff-001]] → L2 Diff
 │   └─ 点击 [[jwt-validation-test-001]] → L2 用例
 └─ 点击 [[oauth2-integration]] → L1 详细设计
     ├─ ...
     └─ ...
```

**额外导航功能：**

- **面包屑导航：** 在 L1/L2 文档顶部显示返回路径，如 `idea-auth-system > jwt-token-validation > diff-001`（通过 `MarkdownPostProcessor` 注入）
- **侧边栏概览面板：** 展示当前想法的文档树 + 用例状态汇总，状态图标：✅（pass）❌（fail）⏳（pending）○（无用例）
- **状态仪表盘：** 一个汇总视图，展示所有想法及其用例通过率，包含汇总卡片（总数、通过、失败、进行中、通过率%）和详细表格

---

## 4. 与 Claude Code 的集成

### 4.1 Shell 环境解决方案

macOS 上 Obsidian 作为 GUI 应用不会加载用户的 login shell 环境（`.zshrc` / `.zprofile`），导致 `claude` CLI 命令无法找到。插件通过以下方式解决：

1. **Login shell 环境解析：** 插件启动时通过 `zsh -l -i -c 'env'` 获取完整的 login shell 环境变量并缓存
2. **环境注入：** 所有 `child_process.exec` 调用均注入解析后的环境变量，确保 `claude` CLI 可被找到
3. **可配置 Shell：** 支持在设置中选择 `/bin/zsh`（默认）、`/bin/bash`、`/bin/sh`
4. **额外 PATH：** 如自动解析仍找不到 `claude`，可在设置中手动指定额外的 PATH 目录

### 4.2 工作流

```
┌─────────────────────────────────────────────────────────┐
│  人类在 Obsidian 写想法                                   │
│  "用户登录时需要进行 JWT token 验证"                        │
└──────────────────────┬──────────────────────────────────┘
                       │ 触发插件命令
                       ▼
┌─────────────────────────────────────────────────────────┐
│  插件显示进度条（不确定模式）                                │
│  读取文档内容，调用 Claude Code                             │
│  (通过 Claude Code CLI 或 Anthropic API)                 │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Claude Code 返回:                                       │
│  1. 识别出的关键语句列表                                    │
│  2. 每个关键语句的详细设计                                   │
│  3. 建议的用例                                            │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  插件自动（进度条切换为确定模式，逐步推进）:                    │
│  1. 在原文中插入 wiki-link                                 │
│  2. 创建 L1 详细设计文档                                    │
│  3. 创建 L2 用例文档                                       │
│  4. 更新状态着色                                           │
│  5. 写入操作日志                                           │
└─────────────────────────────────────────────────────────┘
```

### 4.3 Claude Code 调用接口

插件通过以下方式之一与 Claude Code 交互：

**方式 A — CLI 调用（推荐）：**

```typescript
import { shellExec } from '../utils/shell-env';

async function analyzeIdea(content: string): Promise<AnalysisResult> {
  const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  const cmd = `claude --print --output-format json -p "${escapedPrompt}"`;

  // shellExec 自动注入 login shell 环境，确保 claude CLI 可被找到
  const { stdout } = await shellExec(cmd, settings.shell, settings.extraPath);
  return extractJson(stdout);
}
```

**方式 B — API 直接调用：**

```typescript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': settings.apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: settings.model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  }),
});
```

### 4.4 Diff 自动追踪

当 Claude Code 在项目中执行代码修改后：

1. 插件以 30 秒间隔轮询 `git log` 检测新 commit
2. 检测到新 commit 时，通过 `git diff` 提取变更内容
3. 根据 commit message 或变更文件路径，关联到对应的 L1 文档
4. 自动生成 L2 diff 记录文档并更新 L1 文档的 diff 表格
5. 全过程记录操作日志

所有 git 命令通过 `shellExec()` 执行，自动注入正确的 shell 环境。

### 4.5 用例执行集成

执行流程：
1. 插件通过 `shellExec()` 调用配置的测试命令（如 `npm test`）
2. 启发式解析测试输出，匹配到对应用例名称
3. 根据输出上下文中的 `pass`/`fail`/`✓`/`✗` 等关键词判断状态
4. 更新用例文档中的状态和执行时间
5. 重新计算 L0 文档的状态着色
6. 记录操作日志（含每条用例的状态变更详情）

---

## 5. 插件设置

```typescript
type ShellType = '/bin/zsh' | '/bin/bash' | '/bin/sh';

interface AiJupyterSettings {
  // 目录配置 —— 各目录在 vault 根下同级
  ideasFolder: string;        // default: "ideas"
  detailsFolder: string;      // default: "details"
  diffsFolder: string;        // default: "diffs"
  testsFolder: string;        // default: "tests"
  logsFolder: string;         // default: "logs"

  // Shell 配置 —— 解决 macOS GUI 环境变量问题
  shell: ShellType;           // default: "/bin/zsh"
  extraPath: string;          // 追加到 PATH 的目录（: 分隔），default: ""

  // Claude 集成
  claudeMode: 'cli' | 'api';  // default: "cli"
  apiKey: string;              // 仅 api 模式需要
  model: string;               // default: "claude-sonnet-4-6"

  // 行为配置
  autoLinkOnSave: boolean;    // 保存时自动识别关键语句, default: false
  autoTrackDiffs: boolean;    // 自动追踪 git diff, default: true
  autoRunTests: boolean;      // 代码变更后自动执行用例, default: false
  testCommand: string;        // 测试执行命令, default: "npm test"

  // 外观
  enableStatusColors: boolean; // 启用状态着色, default: true
  showBreadcrumbs: boolean;    // 显示面包屑导航, default: true
  showSidePanel: boolean;      // 显示侧边栏概览, default: true
}
```

**设置面板分组：** 目录配置 → Shell 配置 → Claude 集成 → 行为配置 → 外观

---

## 6. 命令列表

| 命令 | 描述 |
|------|------|
| `AiJupyter: Link Keywords` | 识别当前文档关键语句并转化为链接 |
| `AiJupyter: Generate Detail` | 为选中文本生成详细设计文档 |
| `AiJupyter: Record Diff` | 手动记录当前 git diff |
| `AiJupyter: Run Tests` | 执行关联用例并更新状态 |
| `AiJupyter: Refresh Status` | 刷新所有文档的用例状态着色 |
| `AiJupyter: Open Dashboard` | 打开想法状态汇总仪表盘 |
| `AiJupyter: Open Side Panel` | 打开侧边栏概览 |
| `AiJupyter: Sync All` | 全量同步：识别链接 + 追踪 diff + 执行用例 |

---

## 7. 数据流示例

以一个完整的端到端流程为例：

```
Step 1: 人类写想法
─────────────────
ideas/idea-auth-system.md:
"系统需要支持用户通过 JWT 进行身份验证，并支持 OAuth2 第三方登录。"

Step 2: 触发 Link Keywords
─────────────────────────
插件显示进度条（脉冲动画 + "正在调用 Claude 分析关键语句..."）
调用 Claude Code，识别出两个关键语句：
  - "通过 JWT 进行身份验证"
  - "OAuth2 第三方登录"

Step 3: 文档自动生成（进度条切换为确定模式，逐步推进 1/2 → 2/2）
───────────────────
  ideas/idea-auth-system.md                              (更新：插入 wiki-link)
  details/auth-system/jwt-authentication.md              (新建)
  details/auth-system/oauth2-third-party-login.md        (新建)
  tests/auth-system/jwt-authentication-tests.md          (新建)
  tests/auth-system/oauth2-third-party-login-tests.md    (新建)
  logs/2026-04-11-14-30-05-识别关键语句-idea-auth-system.md (新建：操作日志)

Step 4: Claude Code 实现代码
──────────────────────────
  人类 review 详细设计 → 确认 → Claude Code 写代码 → git commit

Step 5: Diff 自动记录（插件每 30s 轮询检测新 commit）
────────────────────
  diffs/auth-system/jwt-authentication-diff-001.md       (自动生成)
  logs/2026-04-11-14-35-42-自动记录-git-diff.md          (操作日志)

Step 6: 用例执行
───────────────
  执行测试 → 2/3 pass → 用例文档更新 → 顶层文档标记为黄色(in-progress)
  logs/2026-04-11-14-40-10-执行测试用例.md                (操作日志)

Step 7: 修复 & 全部通过
─────────────────────
  Claude Code 修复 → 重新测试 → 3/3 pass → 顶层文档标记为绿色(all-pass)
```

---

## 8. 技术实现要点

### 8.1 插件架构

```
src/
├── main.ts                        # 插件入口，注册命令、视图、事件和 Ribbon 图标
├── settings.ts                    # 设置面板 UI
├── settings-data.ts               # 设置接口定义与默认值
├── services/
│   ├── claude-service.ts          # Claude Code CLI / Anthropic API 调用封装
│   ├── link-service.ts            # 关键语句识别与链接化（含进度条 + 日志）
│   ├── diff-service.ts            # Git diff 追踪与记录（30s 轮询 + 日志）
│   ├── test-service.ts            # 用例执行与状态更新（含日志）
│   └── status-service.ts          # 状态计算与缓存
├── views/
│   ├── dashboard-view.ts          # 仪表盘视图（汇总卡片 + 详细表格）
│   ├── side-panel-view.ts         # 侧边栏文档树概览
│   ├── breadcrumb-view.ts         # 面包屑导航 (MarkdownPostProcessor)
│   ├── status-color-processor.ts  # 状态着色 (MarkdownPostProcessor)
│   └── progress-indicator.ts      # 进度条组件（确定/不确定模式 + 计时器）
├── models/
│   ├── idea.ts                    # 想法数据模型 (IdeaStatus, AnalysisResult, AnalyzedKeyword)
│   ├── detail.ts                  # 详细设计数据模型
│   ├── diff-record.ts             # Diff 记录数据模型
│   └── test-case.ts               # 用例数据模型 (TestStatus: 'pass'|'fail'|'pending')
└── utils/
    ├── shell-env.ts               # Login shell 环境解析与注入（解决 macOS GUI 环境变量问题）
    ├── logger.ts                  # 操作日志记录器（收集 → flush 到 vault 内 .md 文件）
    ├── frontmatter.ts             # YAML frontmatter 解析
    ├── template.ts                # 模板渲染（detail / test / diff 三种模板）
    └── git.ts                     # Git 操作封装（基于 shellExec）
```

### 8.2 关键技术选型

- **Frontmatter 解析：** 使用 Obsidian 内置的 `processFrontMatter` API
- **Markdown 渲染扩展：** 使用 `MarkdownPostProcessor` 注入面包屑导航和状态着色
- **Shell 命令执行：** 统一通过 `shellExec()` 包装 `child_process.exec`，自动注入 login shell 环境
- **文件监听：** 使用 Obsidian 的 `vault.on('modify', ...)` 事件，2 秒 debounce + 运行中互斥锁防止并发
- **构建工具：** esbuild，`platform: "node"` 以支持 Electron 环境的 `child_process`
- **进度显示：** 基于 Obsidian `Notice` API，使用 `duration: 0` 实现持久化显示 + 自定义 HTML
- **Git 操作：** 直接调用 `git` CLI（通过 `shellExec`），不依赖第三方 git 库

### 8.3 性能考量

- 状态着色采用缓存 + 增量更新，不在每次打开文档时全量计算
- Claude API 调用结果用于即时生成，不做结果缓存
- Diff 追踪使用 30 秒轮询间隔，避免频繁 git 操作
- 自动链接使用 2 秒 debounce + 互斥锁，避免连续保存导致并发调用 Claude
- 自动链接仅对 `ideas/` 目录下的文件生效，`details/`、`diffs/`、`tests/`、`logs/` 等同级目录不会被误触发
- 插件启动时预热 login shell 环境（`resolveLoginEnv`），首次命令执行无延迟
- 设置变更时自动清除环境缓存，下次执行重新解析

---

## 9. 未来扩展

- **多人协作：** 支持多人在同一 vault 中维护不同想法
- **版本追踪：** 想法的演进历史记录
- **导出报告：** 将想法及其完成状态导出为 HTML/PDF 报告
- **与项目管理集成：** 同步到 Linear/Jira 等工具
- **Graph View 增强：** 在 Obsidian 的图谱视图中按状态着色节点
