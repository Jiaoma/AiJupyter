# Obsidian Idea Tracker Plugin — Spec

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

```
vault/
├── ideas/                    # L0 顶层想法文档
│   ├── idea-auth-system.md
│   └── idea-data-pipeline.md
├── details/                  # L1 详细设计文档
│   ├── auth-system/
│   │   ├── jwt-token-validation.md
│   │   └── oauth2-integration.md
│   └── data-pipeline/
│       └── stream-processing.md
├── diffs/                    # L2 Diff 记录
│   ├── auth-system/
│   │   └── jwt-token-validation-diff-001.md
│   └── ...
├── tests/                    # L2 用例文档
│   ├── auth-system/
│   │   ├── jwt-token-validation-tests.md
│   │   └── ...
│   └── ...
└── _templates/               # 文档模板
    ├── detail-template.md
    ├── diff-template.md
    └── test-template.md
```

---

## 3. 功能规格

### 3.1 关键语句识别与链接化

**触发方式：** 命令面板 `Idea Tracker: Link Keywords` 或快捷键

**行为：**

1. 读取当前 L0 文档的自然语言内容
2. 调用 Claude Code 识别其中的关键实现语句
3. 将关键语句转化为 Obsidian wiki-link，例如：

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

4. 自动在 `details/` 下创建对应子文档（使用模板）

### 3.2 详细设计文档（L1）

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

### 3.3 Diff 记录文档（L2）

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

### 3.4 用例文档（L2）

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

### 3.5 状态着色

**核心规则：** 当一个 L0 想法文档关联的所有用例全部为 `pass` 状态时，该想法在文档中以绿色背景呈现。

**状态定义：**

| 状态 | 含义 | 颜色 |
|------|------|------|
| all-pass | 所有关联用例通过 | 绿色背景 `#d4edda` |
| has-fail | 存在失败用例 | 红色背景 `#f8d7da` |
| in-progress | 存在 pending 用例 | 黄色背景 `#fff3cd` |
| no-tests | 尚无用例 | 无特殊颜色 |

**实现方式：** 使用 Obsidian 的 CSS snippet + 自定义 data 属性：

```css
/* 通过 plugin 动态注入 data-idea-status 属性 */
.idea-status-all-pass {
  background-color: #d4edda;
  border-left: 4px solid #28a745;
  padding: 2px 6px;
  border-radius: 3px;
}

.idea-status-has-fail {
  background-color: #f8d7da;
  border-left: 4px solid #dc3545;
  padding: 2px 6px;
  border-radius: 3px;
}

.idea-status-in-progress {
  background-color: #fff3cd;
  border-left: 4px solid #ffc107;
  padding: 2px 6px;
  border-radius: 3px;
}
```

**在顶层文档中的呈现效果：**

```markdown
用户登录时需要进行 [[jwt-token-validation|JWT token 验证]]`{.idea-status-all-pass}`，
验证通过后建立会话。
同时需要支持 [[oauth2-integration|OAuth2 第三方登录集成]]`{.idea-status-has-fail}`。
```

> 插件在阅读模式下通过 `MarkdownPostProcessor` 自动解析 wiki-link 并根据用例状态注入对应 CSS class，无需手动添加标记。

### 3.6 导航与遍历

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

- **面包屑导航：** 在 L1/L2 文档顶部显示返回路径，如 `idea-auth-system > jwt-token-validation > diff-001`
- **侧边栏概览面板：** 展示当前想法的文档树 + 用例状态汇总
- **状态仪表盘：** 一个汇总视图，展示所有想法及其用例通过率

---

## 4. 与 Claude Code 的集成

### 4.1 工作流

```
┌─────────────────────────────────────────────────────────┐
│  人类在 Obsidian 写想法                                   │
│  "用户登录时需要进行 JWT token 验证"                        │
└──────────────────────┬──────────────────────────────────┘
                       │ 触发插件命令
                       ▼
┌─────────────────────────────────────────────────────────┐
│  插件读取文档内容，调用 Claude Code                         │
│  (通过 Claude Code CLI 或 Claude API)                    │
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
│  插件自动:                                                │
│  1. 在原文中插入 wiki-link                                 │
│  2. 创建 L1 详细设计文档                                    │
│  3. 创建 L2 用例文档                                       │
│  4. 更新状态着色                                           │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Claude Code 调用接口

插件通过以下方式之一与 Claude Code 交互：

**方式 A — CLI 调用（推荐）：**

```typescript
import { exec } from 'child_process';

async function analyzeIdea(content: string): Promise<AnalysisResult> {
  const prompt = `分析以下想法描述，识别关键实现语句并为每个语句生成：
1. 详细技术方案
2. 建议测试用例

想法描述：
${content}

以 JSON 格式返回结果。`;

  return new Promise((resolve, reject) => {
    exec(`claude --print --output-format json "${prompt}"`, (err, stdout) => {
      if (err) reject(err);
      resolve(JSON.parse(stdout));
    });
  });
}
```

**方式 B — API 调用：**

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: settings.apiKey });

async function analyzeIdea(content: string): Promise<AnalysisResult> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: buildPrompt(content) }],
  });
  return parseResponse(response);
}
```

### 4.3 Diff 自动追踪

当 Claude Code 在项目中执行代码修改后：

1. 插件监听 git 变更（通过 `fs.watch` 或定时轮询 `git diff`）
2. 检测到新 commit 时，提取 diff 内容
3. 根据 commit message 或变更文件路径，关联到对应的 L1 文档
4. 自动生成 L2 diff 记录文档

### 4.4 用例执行集成

```typescript
interface TestExecution {
  trigger: 'manual' | 'auto';  // 手动触发 or 代码变更后自动触发
  runner: 'claude-code' | 'jest' | 'pytest' | 'custom';
  command: string;              // e.g. "npm test -- --testPathPattern=auth"
}
```

执行流程：
1. 插件调用配置的测试命令
2. 解析测试输出，匹配到对应用例
3. 更新用例文档中的状态和执行时间
4. 重新计算 L0 文档的状态着色

---

## 5. 插件设置

```typescript
interface IdeaTrackerSettings {
  // 目录配置
  ideasFolder: string;        // default: "ideas"
  detailsFolder: string;      // default: "details"
  diffsFolder: string;        // default: "diffs"
  testsFolder: string;        // default: "tests"
  templatesFolder: string;    // default: "_templates"

  // Claude 集成
  claudeMode: 'cli' | 'api';
  apiKey?: string;            // 仅 api 模式
  model: string;              // default: "claude-sonnet-4-6"

  // 行为配置
  autoLinkOnSave: boolean;    // 保存时自动识别关键语句, default: false
  autoTrackDiffs: boolean;    // 自动追踪 git diff, default: true
  autoRunTests: boolean;      // 代码变更后自动执行用例, default: false
  testCommand: string;        // 测试执行命令

  // 外观
  enableStatusColors: boolean; // 启用状态着色, default: true
  showBreadcrumbs: boolean;    // 显示面包屑导航, default: true
  showSidePanel: boolean;      // 显示侧边栏概览, default: true
}
```

---

## 6. 命令列表

| 命令 | 描述 |
|------|------|
| `Idea Tracker: Link Keywords` | 识别当前文档关键语句并转化为链接 |
| `Idea Tracker: Generate Detail` | 为选中文本生成详细设计文档 |
| `Idea Tracker: Record Diff` | 手动记录当前 git diff |
| `Idea Tracker: Run Tests` | 执行关联用例并更新状态 |
| `Idea Tracker: Refresh Status` | 刷新所有文档的用例状态着色 |
| `Idea Tracker: Open Dashboard` | 打开想法状态汇总仪表盘 |
| `Idea Tracker: Sync All` | 全量同步：识别链接 + 追踪 diff + 执行用例 |

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
插件调用 Claude Code，识别出两个关键语句：
  - "通过 JWT 进行身份验证"
  - "OAuth2 第三方登录"

Step 3: 文档自动生成
───────────────────
  ideas/idea-auth-system.md     (更新：插入 wiki-link)
  details/auth-system/jwt-authentication.md        (新建)
  details/auth-system/oauth2-third-party-login.md  (新建)
  tests/auth-system/jwt-authentication-tests.md    (新建)
  tests/auth-system/oauth2-third-party-login-tests.md (新建)

Step 4: Claude Code 实现代码
──────────────────────────
  人类 review 详细设计 → 确认 → Claude Code 写代码 → git commit

Step 5: Diff 自动记录
────────────────────
  diffs/auth-system/jwt-authentication-diff-001.md  (自动生成)

Step 6: 用例执行
───────────────
  执行测试 → 2/3 pass → 用例文档更新 → 顶层文档标记为黄色(in-progress)

Step 7: 修复 & 全部通过
─────────────────────
  Claude Code 修复 → 重新测试 → 3/3 pass → 顶层文档标记为绿色(all-pass)
```

---

## 8. 技术实现要点

### 8.1 插件架构

```
src/
├── main.ts                    # 插件入口，注册命令和事件
├── settings.ts                # 设置面板
├── services/
│   ├── claude-service.ts      # Claude Code/API 调用封装
│   ├── link-service.ts        # 关键语句识别与链接化
│   ├── diff-service.ts        # Git diff 追踪与记录
│   ├── test-service.ts        # 用例执行与状态更新
│   └── status-service.ts      # 状态计算与着色
├── views/
│   ├── dashboard-view.ts      # 仪表盘视图
│   ├── side-panel-view.ts     # 侧边栏概览
│   └── breadcrumb-view.ts     # 面包屑导航
├── models/
│   ├── idea.ts                # 想法数据模型
│   ├── detail.ts              # 详细设计数据模型
│   ├── diff-record.ts         # Diff 记录数据模型
│   └── test-case.ts           # 用例数据模型
└── utils/
    ├── frontmatter.ts         # YAML frontmatter 解析
    ├── template.ts            # 模板渲染
    └── git.ts                 # Git 操作封装
```

### 8.2 关键技术选型

- **Frontmatter 解析：** 使用 Obsidian 内置的 `processFrontMatter` API
- **Markdown 渲染扩展：** 使用 `MarkdownPostProcessor` 注入状态样式
- **Git 操作：** 使用 `simple-git` 库
- **文件监听：** 使用 Obsidian 的 `vault.on('modify', ...)` 事件

### 8.3 性能考量

- 状态着色采用缓存 + 增量更新，不在每次打开文档时全量计算
- Claude API 调用结果缓存，相同内容不重复请求
- Diff 追踪使用 debounce，避免频繁 git 操作

---

## 9. 未来扩展

- **多人协作：** 支持多人在同一 vault 中维护不同想法
- **版本追踪：** 想法的演进历史记录
- **导出报告：** 将想法及其完成状态导出为 HTML/PDF 报告
- **与项目管理集成：** 同步到 Linear/Jira 等工具
- **Graph View 增强：** 在 Obsidian 的图谱视图中按状态着色节点
