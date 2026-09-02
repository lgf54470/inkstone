# RULES

## 核心思想

- 以第一性原理思考问题。理解需求背后的真实目标，而不是直接套用已有模式或技术方案。
- 优先解决本质问题，避免为假设中的未来需求提前设计复杂系统。
- 在保证长期可维护性的前提下，选择当前最简单、可靠、清晰的实现方案。

## 代码质量原则

- 保持模块职责明确，避免一个模块承担过多职责。
- 优先使用成熟、稳定、维护良好的第三方库，而不是重复造轮子。
- 使用项目已有依赖解决问题之前，不要随意新增依赖。
- 在引入新方案前，先检查已有代码、依赖、文档和能力。

## 简洁与设计原则

- 遵循 KISS（Keep It Simple, Stupid）原则：优先选择简单直接的实现，避免不必要的复杂度。
- 遵循 DRY（Don't Repeat Yourself）原则：避免重复逻辑，但不要为了消除少量重复而创建过度抽象。
- 遵循 SOLID 思想：保持职责清晰、降低模块耦合，提高代码可维护性和扩展能力。
- 避免为了"看起来更优雅"而增加实际复杂度。

## 工程决策原则

- 优先选择长期可维护的方案，而不是只能临时运行的解决方案。
- 代码应该服务于业务目标，而不是为了展示技术复杂度。
- 如果简单方案已经满足需求，不要主动升级为复杂方案。

## 架构原则

- 不要为了保持向后兼容而长期保留废弃方案。优先删除过时代码，而不是增加兼容层、fallback 或临时迁移逻辑。
- 不要进行未经验证的架构设计。避免提前引入抽象、配置和间接层。
- 从最小可工作的版本开始，逐步演进系统。每次修改都应该建立在已有可运行系统之上。
- 永远不要用未来可能需要的复杂性，牺牲当前产品的可用性。



# Git 提交规范

基于 [Conventional Commits](https://www.conventionalcommits.org/)，并约定
正文逐文件说明改动（本项目暂无 commit-msg hook 强制校验，靠约定与
code review 把关；本仓库历史提交即按此规范书写）。

## 1. 格式

```
<type>(<scope>): <subject>

- <path/to/file>: <改动内容，到方法/组件级>
- <path/to/file>: <改动内容，到方法/组件级>
...

[可选正文补充说明]

[可选 footer：BREAKING CHANGE: ... / Closes #123]
```

- `subject` 用祈使句、不超过 50 字符、不加句号，可用中文。
- 正文**至少一条**以 `-` 开头、包含文件路径的改动行。
- 每条改动行描述"做了什么"，不是"文件是什么"——写
  `tasks-provider 新增 importTasks() 并处理 nextTaskId 防冲突`，
  不要写 `修改了 tasks 模块文件`。

## 2. type 列表

| type       | 用途                                                       |
| ---------- | ---------------------------------------------------------- |
| `feat`     | 新功能                                                     |
| `fix`      | 修 bug                                                     |
| `docs`     | 仅文档改动                                                 |
| `style`    | 不影响逻辑的格式改动（缩进/空格，prettier 之外的手动调整） |
| `refactor` | 不改变行为的代码重构                                       |
| `perf`     | 性能优化                                                   |
| `test`     | 新增/修改测试                                              |
| `build`    | 构建配置、`vite.config.ts`、依赖变更                       |
| `ci`       | GitHub Actions                                             |
| `chore`    | 杂项（依赖版本锁定、`.gitignore` 等）                       |
| `revert`   | 回退某次提交                                               |

## 3. scope 列表

业务模块 id（`notes`/`folders`/`tags`/`editor`/`preview`/`graph`/`command`/`sidebar`/`auth`/`files`/`backup`/`share`/`mcp`/`settings`/`sync`/`templates`/`update`）或以下基础设施 scope：

| scope       | 覆盖范围                                                     |
| ----------- | ------------------------------------------------------------ |
| `theme`     | 主题引擎/设计令牌（`styles/*`、`editor/theme.ts` 等）        |
| `shell`     | 布局壳（`features/shell/*`、AppShell、导航壳层等）           |
| `i18n`      | 国际化（`lib/i18n.ts`、`shared/locales/*`、check-i18n）      |
| `workspace` | 工作区状态（双栏 pane、分栏比例、活动笔记联动等）             |
| `ui`        | `components/*` 通用 UI 组件（primitives/form/overlay/feedback） |
| `db`        | 数据库与本地持久化（`worker/db/*`、`client/lib/db*`、D1 迁移）|
| `infra`     | 构建/CI/Wrangler/环境依赖/检测脚本                           |
| `docs`      | 改动横跨多个文档或专注文档规范时                             |

## 4. 示例

**新功能，多文件：**

```
feat(tasks): 支持粘贴 JSON 批量导入任务

- modules/tasks/components/tasks-import-dialog.tsx: 新增导入对话框（textarea 粘贴 + Zod 逐条校验，错误行号反馈）
- modules/tasks/components/tasks-provider.tsx: 新增 importTasks()，经 nextTaskId(existing) 生成不冲突的 TASK-<n> id
- modules/tasks/locales.ts: 补导入对话框三语文案
```

**修 bug，单文件：**

```
fix(theme): 修复暗色切换时派生 CSS 变量不重放的问题

- context/shadcn-theme-provider.tsx: MutationObserver 回调改读 configRef.current，保证 class 翻转时应用最新配置
```

**文档：**

```
docs: 重建全量文档体系——架构总纲/功能契约/全量设计令牌/换栈提示词

- AGENTS.md: AI 协作者速查表（核心原则 + 硬规则 + 文档地图）
- ARCHITECTURE.md: 架构总纲 13 章
- docs/architecture/design-system.md: 全量设计令牌（OKLCH 全表、8 风格矩阵）
```

## 5. 提交前检查

- `npm run typecheck` 通过（涉及代码时）；构建/依赖改动加跑
  `npm run build && npm run perf:check`。
- 不提交 `build/`、`.env` 类产物/敏感文件。
- 一次提交一个主题；混合改动拆成多次提交。
- **AI 助手纪律：未经用户明确指示，不执行 `git commit` / `git push`**——
  只负责准备暂存与符合本规范的提交信息，提交动作由用户决定。

