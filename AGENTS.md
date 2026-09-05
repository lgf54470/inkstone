# AGENTS.md

## 核心思想

- 第一性原理：先弄清需求背后的真实目标，再选方案，不套模板。
- 解决当前本质问题，不为假想的未来需求预设计。
- 在可维护的前提下，选最简单、可靠、清晰的实现。
- 代码服务业务目标，不为展示技术复杂度。

## 铁律（不可违反）

1. **单文件 ≤ 500 行**，单函数 ≤ 50 行，嵌套 ≤ 3 层。超限即拆分。
2. **禁止硬编码**：颜色/间距/字号/圆角/z-index 一律用设计令牌（CSS 变量 / Tailwind 主题），魔法数字提为具名常量，URL/密钥/开关走配置或环境变量。
3. **禁止复制粘贴逻辑**：出现第二次即抽取；但不为消除 1–2 处小重复造抽象。
4. **禁止跨层直接依赖**：UI 不碰数据库/网络，业务逻辑不 import 组件，模块间只通过公开接口（`index.ts`）通信，禁止深路径引用。
5. **禁止 `any` / `@ts-ignore` / 空 catch / 吞异常**；错误要么处理、要么带上下文抛出。
6. **禁止留死代码**：不用的代码、注释掉的代码、废弃 fallback、兼容层直接删，git 里有历史。
7. **禁止新增依赖前不查已有依赖**；新增依赖须说明理由，且优先选活跃维护、体积小、无重复功能的库。
8. **禁止未验证就提交**：改动必须过 lint、类型检查、相关测试；新增逻辑必须有可运行的验证方式。
9. **禁止无脑全局状态**：状态就近放置，能局部不提升，能派生不存储。
10. **禁止修改不理解的代码**：改前先读调用方与测试，弄清副作用。

## 写代码前必须过的清单

按顺序自问，任一项不满足先重构再动手：

- **复用性**：现有代码/组件/hook/工具能否直接用或小改后用？
- **简洁性**：能否用更少的概念、更少的文件、更少的分支实现？
- **可测性**：核心逻辑是否是纯函数？副作用是否被隔离到边界（IO/DOM/网络）？
- **可维护性**：半年后的人能否 5 分钟看懂？命名是否自解释、无需注释？
- **可配置性**：会变的值（阈值、文案、路径、开关）是否外置？但不为不会变的东西加配置。
- **解耦**：模块间是否只依赖接口而非实现？删掉这个模块，其他模块是否只需改 import？
- **模块化**：目录是否按业务域组织（feature-first），而非按文件类型（`components/ utils/` 大杂烩）？
- **工程化**：是否能被 lint / 类型 / 测试 / CI 自动约束，而不是靠人记？

## 代码规范

- **命名**：文件 kebab-case，组件 PascalCase，函数/变量 camelCase，常量 UPPER_SNAKE，布尔值用 `is/has/can/should` 前缀，事件处理 `handleXxx`，回调 prop `onXxx`。
- **函数**：单一职责，参数 ≤ 3 个（多则传对象），优先纯函数，早返回减少嵌套。
- **类型**：接口/类型集中在模块 `types.ts`，对外 API 参数用 Zod 等运行时校验，内部靠 TS。
- **组件**：展示与逻辑分离（容器/hook + 纯 UI），props 不透传超过 2 层（用组合或 context）。
- **样式**：只用令牌与工具类；组件不写内联像素值；响应式断点用统一变量；不用 `!important`。
- **注释**：只解释"为什么"，不解释"是什么"；TODO 必须带 issue 号或负责人。
- **导入顺序**：第三方 → 别名路径 → 相对路径 → 样式；禁止循环依赖。
- **异步**：统一 `async/await`，边界处集中处理 loading/error/empty 三态。

## 设计原则

- KISS：简单直接优先，不为"优雅"增加复杂度。
- DRY：消除重复逻辑，但抽象要等到第三次出现且模式清晰。
- SOLID：职责单一、依赖接口、开闭扩展；不为原则而原则。
- YAGNI：不加现在用不到的抽象、配置、间接层。
- 从最小可工作版本开始，每次改动建立在可运行系统之上。
- 不为向后兼容长期保留旧方案，直接迁移并删除。

## 提交前自检

- [ ] 文件 ≤ 500 行，无硬编码，无 `any`，无死代码
- [ ] lint / typecheck / test 全过
- [ ] 改动最小化，不夹带无关格式化
- [ ] commit message 符合下方规范

---

# Git 提交规范

基于 [Conventional Commits](https://www.conventionalcommits.org/)，正文逐文件说明改动。

## 格式

```
<type>(<scope>): <subject>

- <path/to/file>: <改动内容，到方法/组件级>
- <path/to/file>: <改动内容，到方法/组件级>

[可选补充说明]
[可选 footer：BREAKING CHANGE: ... / Closes #123]
```

- `subject`：祈使句，≤ 50 字符，无句号，可中文。
- 正文至少一条 `- 路径: 改动` 行，写"做了什么"而非"文件是什么"。
  - ✅ `tasks-provider.tsx: 新增 importTasks()，经 nextTaskId 防 id 冲突`
  - ❌ `修改了 tasks 模块文件`

## type

| type       | 用途                 |
| ---------- | -------------------- |
| `feat`     | 新功能               |
| `fix`      | 修 bug               |
| `refactor` | 不改行为的重构       |
| `perf`     | 性能优化             |
| `test`     | 测试                 |
| `docs`     | 仅文档               |
| `style`    | 纯格式（不影响逻辑） |
| `build`    | 构建配置、依赖变更   |
| `ci`       | CI 配置              |
| `chore`    | 杂项                 |
| `revert`   | 回退                 |

## scope

业务模块 id：`notes` `folders` `tags` `editor` `preview` `graph` `command` `sidebar` `auth` `files` `backup` `share` `mcp` `settings` `sync` `templates` `update` `blog`

基础设施 scope：

| scope       | 范围                                   |
| ----------- | -------------------------------------- |
| `theme`     | 主题引擎 / 设计令牌                    |
| `shell`     | 布局壳、导航壳层                       |
| `i18n`      | 国际化、locales、check-i18n            |
| `workspace` | 工作区状态（pane、分栏、活动笔记）     |
| `ui`        | `components/*` 通用组件                |
| `db`        | 数据库、本地持久化、迁移               |
| `infra`     | 构建 / CI / Wrangler / 脚本            |
| `docs`      | 跨多文档或文档规范                     |

## 示例

```
feat(tasks): 支持粘贴 JSON 批量导入任务

- modules/tasks/components/tasks-import-dialog.tsx: 新增导入对话框（textarea 粘贴 + Zod 逐条校验，错误行号反馈）
- modules/tasks/components/tasks-provider.tsx: 新增 importTasks()，经 nextTaskId(existing) 生成不冲突的 TASK-<n> id
- modules/tasks/locales.ts: 补导入对话框三语文案
```

```
fix(theme): 修复暗色切换时派生 CSS 变量不重放

- context/shadcn-theme-provider.tsx: MutationObserver 回调改读 configRef.current，保证 class 翻转时应用最新配置
```