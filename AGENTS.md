# AGENTS.md

> 通用 Web 开发工程规范，框架无关，覆盖前端、后端、全栈及基础设施。
> 适用于本仓库所有 AI 代理与人的改动。落地项目仅填写文末「项目信息」。
> 标准文件名：AGENTS.md，不要使用 AGENTS.md.txt。若已有同名文件，以本文件为基线合并，冲突取更严格者。

## 使用说明

- 规则等级：
  - MUST：必须遵守，违反需走「例外流程」；安全、正确性、可访问性 MUST 不允许例外。
  - SHOULD：默认遵守，偏离需在 PR/提交说明中写清原因、影响、回收计划。
  - MAY：可选，按项目实际采用。
- 冲突优先级：
  安全与合规 > 正确性 > 可访问性 > 可维护性 > 简洁与一致性 > 性能 > 交付速度。
  安全、正确性、可访问性不可为简洁、性能或交付速度降级。
- 未覆盖场景：按上述优先级选择最接近既有规则精神的做法，并在 PR 说明。
- 子项目可制定更具体规范；冲突时取更严格者。
- 修改本文件需 PR 评审；全局工程策略重大变更优先写 ADR。

## 核心原则

- 第一性原理：先弄清真实目标，再选方案，不套模板。
- 需求澄清优先：关键行为、边界条件、验收标准不明确时，先提问或列假设确认；不静默脑补。
- 解决当前本质问题，不为假想未来预设计。
- 可维护前提下，选最简单、可靠、清晰的实现。
- 代码服务业务目标，不为展示技术复杂度。
- 能自动化的约束不靠人记；能工具强制的不靠文档提醒。
- 默认安全、默认可访问、默认可验证；不能验证必须显式说明风险。
- 不静默假设，不静默失败，不静默降级。

## 铁律（MUST）

1. 安全与隐私优先
   - 密钥、令牌、密码、私密凭据不进仓库；维护 `.env.example`。前端环境变量会打包进产物，只放公开配置；服务端凭据只走服务端环境变量或密钥管理服务。
   - 所有外部输入必须校验；服务端校验是最终信任边界，前端校验只改善体验。输出按上下文编码：HTML、URL、SQL、Shell、JSON、日志、模板不得直接拼接不可信输入。
   - 权限最小化；按风险配置认证、授权、会话、CSRF、CORS、CSP、安全响应头、速率限制、防暴力破解。
   - 禁止无评审使用 `eval`、`new Function`、`innerHTML`、`dangerouslySetInnerHTML`、`v-html` 处理非受控输入；必须使用时先净化并注明原因。
   - 文件上传校验类型、大小、内容、存储路径；上传目录与执行目录隔离。防范 SSRF、路径遍历、开放重定向、命令注入、模板注入、不安全反序列化。
   - 日志脱敏，不记录密钥、令牌、密码、完整个人敏感信息。依赖定期审计，锁文件必须提交，关注供应链安全。隐私遵循数据最小化、目的限制、保留期限、删除/导出要求。

2. 禁止静默失败
   - 不允许空 catch、忽略返回错误、屏蔽类型/编译警告。错误要么处理，要么带上下文向上抛出。
   - 面向用户的调用边界必须处理「加载中 / 失败 / 空结果」三态；服务端 API 必须有明确错误响应与状态码。
   - 唯一例外：可选 best-effort 后台操作（缓存清理、埋点上报、探活重试等）允许吞错，但 catch 体必须紧邻注释说明原因，并尽可能记录最低级别日志或指标。

3. 禁止跨层直接依赖
   - 展示层不直接发起数据库/网络请求，须经数据层/服务层；业务逻辑不依赖具体 UI 实现。
   - 跨模块只通过公开入口（`index`、package exports、领域入口）通信，禁止引用其他模块内部深路径；禁止循环依赖。

4. 禁止硬编码，但不过度配置
   - 颜色、间距、字号、圆角、阴影、z-index 等设计原语一律走设计令牌；一次性布局结构值除外。魔法数字提为具名常量。
   - 会变的阈值、路径、开关、文案外置为配置；不会变的值不加配置。URL 可配置；密钥只允许服务端安全存储。
   - 配置项应有明确名称、类型、默认值、校验和文档；启动时校验关键配置，缺失或非法应快速失败。

5. 禁止死代码，公共契约走弃用流程
   - 不用的代码、注释掉的代码、废弃 fallback、内部兼容层直接删，历史在 git。迁移完成即删。
   - 公共 API、开放接口、持久化数据迁移等公共契约例外：需 deprecation 标记 + 迁移窗口 + 到期删除。已应用的迁移只新增不修改。

6. 禁止未验证提交
   - 改动必须通过 lint、类型检查、相关测试与构建，命令见「项目信息」。
   - 新增逻辑必须有可运行验证：自动测试，或 PR 中写明手动验证步骤。不能验证必须说明原因和风险。
   - AI 代理不得伪造、猜测或省略验证结果；无法运行验证时必须如实说明。

7. 单一职责，状态就近
   - 模块/文件/函数只做一件事，一句话说不清职责先拆。一个模块不得同时承担数据获取、业务规则、UI 渲染、持久化。
   - 状态放在使用它的最小范围；能局部不提升，能派生计算不重复存储。服务端状态、缓存、表单状态、UI 状态按边界管理，禁止无脑全局状态。

8. 禁止重复造轮子，也禁止乱加依赖
   - 优先用成熟、稳定、维护良好的库。引入新依赖前必须确认现有依赖无法解决，并评估维护活跃度、包体积、许可证、安全记录与供应链风险，在 commit/PR 中说明理由。
   - 不擅自升级依赖或改动 lockfile；不长期保留废弃依赖，迁移完成后删除。

9. 禁止修改不理解的代码
   - 改前先读调用方、被调用方与测试，弄清副作用范围；读不懂先问，或先补测试/加日志验证，不靠猜。

10. 交互控件必须基于语义元素
    - 所有交互元素使用项目 UI 组件库或项目内自定义组件，禁止绕过组件体系写裸样式控件；禁止用 `div`/`span` + `onClick` 模拟控件。
    - 组件实现必须基于原生语义元素（`button`、`a`、`input`、`select`、`textarea` 等）；自定义外观时套设计系统样式，并保留键盘与焦点行为。Canvas、地图、富文本等特殊场景必须实现等价键盘、焦点与 ARIA，并补充测试。

11. 禁止原生弹窗/提示
    - 严禁调用 `window.alert`、`window.confirm`、`window.prompt`。替代 Toast/Modal/Dialog 必须处理：打开时焦点移入、关闭后焦点归还、ESC 关闭、遮罩点击、正确 `role` 与 `aria-*` 属性。
    - `beforeunload` 等浏览器强制 API 例外，但需封装并注明原因。

12. 统一样式来源
    - 样式经 CSS Modules、CSS-in-JS、设计令牌或原子化 utility（如 Tailwind，须与令牌体系打通）管理，禁止散落的静态内联样式。
    - 例外：运行时动态值（拖拽坐标、按状态计算的 CSS 变量）允许 JS 设置 CSS 变量或内联样式。`!important` 默认禁止，仅限覆盖第三方样式、打印样式、可访问性强制覆盖，且须限定作用域并注释原因。

13. 可访问性红线
    - 交互元素必须键盘可达、焦点顺序合理、焦点样式可见、语义正确、ARIA 使用恰当。图片、图标、表单、弹窗、菜单、表格需有可访问名称和状态。
    - 颜色对比度满足 WCAG AA；支持「减少动画」偏好；触控目标尺寸合理；表单错误与字段关联；必要时使用 live region 通知状态变化。
    - 自定义组件必须测试键盘与屏幕阅读器基本路径。

14. 不顺手修无关问题
    - 改动中发现的其他问题，另开 issue 或单独提交，不在本次改动中夹带。

15. AI 代理行为约束
    - AI 代理必须遵守本文件全部规则。
    - 不执行破坏性命令（如 `rm -rf`、`git reset --hard`、force push、drop database），除非用户明确要求并二次确认。
    - 不读取、输出、提交密钥或私密凭据；不绕过权限与安全检查。
    - 不伪造测试、lint、构建、审计结果；不能运行时必须说明。
    - 不擅自安装全局依赖、修改系统配置、改动 lockfile 或提交大文件/生成物。
    - 需求不明确时先提问或列出假设，不静默脑补。
    - 改动最小化，不夹带无关重构、格式化或依赖升级。
    - 不修改不理解的代码；不确定时先补测试、加日志或询问。

## 规模与复杂度（SHOULD）

- 单文件 ≤ 500 行；单函数 ≤ 50 行；嵌套 ≤ 3 层。超限优先按职责拆分，不机械拆行。
- 参数超过 3 个或顺序易错时，改用对象/结构体传参；`clamp(value, min, max)` 这类简单函数可例外。
- 同一逻辑第二次出现即评估抽取：约 10 行内完全相同可直接提取；形态仍在演化的重复可等第三次出现且稳定后再抽象，须留 TODO 标注。
- 类型定义、配置文件、常量表、生成代码、数据迁移、测试夹具、SVG、长 JSX 等天然较长文件可豁免，但需在文件头注释或 PR 中说明理由。

## 写代码前清单

按顺序自问，任一项不满足，先澄清或重构再动手：

- 目标：能用一句话说出改动目的与验收标准吗？
- 单一职责：这个模块/函数是否只做一件事？
- 复用：现有代码/工具/组件能否直接用或小改？是否有成熟库？
- 简洁：能否用更少概念、文件、分支实现？当前简单方案是否已满足？
- 可测：核心逻辑是否纯函数？副作用是否隔离到边界？
- 可维护：半年后接手的人能否 5 分钟看懂？命名是否自解释？
- 可配置：会变的值是否外置？不会变的是否避免过度配置？
- 解耦：只依赖对方接口而非实现细节？删掉此模块，其他模块是否只需改一处？
- 模块化：目录是否按业务域组织，而非堆进大目录？
- 安全：输入是否校验？输出是否编码？权限是否最小？密钥是否安全？隐私是否合规？
- 可访问性：键盘、焦点、语义、ARIA、对比度、减少动画是否满足？
- 国际化：文案、日期、数字、货币、复数、时区、RTL 是否外置并正确格式化？
- 性能：是否影响包体积、首屏、交互延迟、渲染次数、网络请求、数据库查询？
- 可观测性：错误、日志、埋点、追踪是否足够定位问题？是否脱敏？
- 工程化：能否交给 lint/类型/测试/CI 自动强制？不能的是否写进 review 清单？
- AI 权限：本次操作是否超出授权？是否可能破坏数据、历史或共享分支？

## 开发规范

### 格式与命名

- 格式化以项目工具（Prettier/Biome 等）配置为准，禁止手工决定风格、禁止夹带无关格式化改动。默认：2 空格缩进、无行尾分号、单引号。
- 文件名 kebab-case；组件/类 PascalCase；函数/变量 camelCase；常量 UPPER_SNAKE_CASE；布尔值用 `is`/`has`/`can`/`should` 前缀；内部事件处理函数用 `handleXxx`，对外回调 props 用 `onXxx`。
- 生成代码、快照、构建产物不手改；确需修改生成逻辑时改源并重新生成。

### 函数与类型

- 单一职责；参数超过 3 个改用对象传参；优先纯函数；用早返回压嵌套；避免隐式全局依赖和副作用。
- 有静态类型：公共接口类型集中定义并导出；组件 props、局部类型就近定义，避免「类型垃圾场」。
- 无静态类型：在模块入口用 schema 校验/断言保证外部输入合法。
- API 契约需定义请求、响应、错误格式、分页、幂等、缓存策略、版本策略。
- 避免 `any`/动态类型逃逸；确需使用时限定作用域并说明原因。

### UI、样式与文案

- 展示逻辑与业务逻辑分离：数据获取/状态管理放独立层，UI 只负责渲染。
- 跨层级共享状态优先用框架的上下文/依赖注入机制（context、provide/inject、store），避免逐层手动透传超过 2 层。
- 响应式断点、z-index、主题令牌统一定义在一处。
- 用户可见文案不得硬编码在组件里：启用 i18n 的项目走资源文件；未启用的集中到文案常量，便于后续抽取。
- 日期、时间、数字、货币、复数按 locale 格式化；时区存储用 UTC，展示按用户时区；支持 RTL 时布局使用逻辑属性，避免写死 left/right。
- 翻译 key 保持稳定、可读、不拼接句子；缺失翻译有回退策略与检查。
- 交互控件、表单、弹窗、菜单必须满足键盘与屏幕阅读器基本路径。

### 注释与依赖

- 注释只解释「为什么」，不解释「这行在做什么」；TODO 必须带 issue 编号或负责人。复杂决策优先写 ADR，而非长注释。
- 导入顺序：外部依赖 → 内部跨模块（别名路径）→ 同模块相对引用 → 样式文件；禁止循环依赖。不强制 barrel `index`，若使用需避免循环依赖和 tree-shaking 问题。

### 异步、并发与错误

- 统一 async/await 或框架推荐写法；在调用边界统一处理加载中/失败/空三态，不允许未处理的 Promise/回调错误。
- 网络请求设置超时、取消与重试策略；重试需退避并考虑幂等；用户离开或条件变化时取消过期请求，避免竞态。
- 错误信息分两层：给用户的（可读、已本地化、不泄露内部细节），给开发者的（带上下文写入日志，不泄露密钥/令牌/个人敏感信息）。
- 前端应有错误边界或等价兜底；后端应有统一异常处理，不向客户端泄露堆栈。

### 数据、API 与持久化

- API 契约明确请求、响应、错误码、分页上限、幂等键、缓存策略与版本。
- 服务端必须再次校验输入；数据库使用约束、事务、索引保护正确性与性能。
- 已应用的迁移只新增不修改；破坏性变更必须带迁移脚本、回滚说明与发布顺序；必要时采用 expand-contract。
- 缓存键、失效策略、服务端与客户端缓存边界必须清晰；避免缓存敏感数据。
- 文件上传、对象存储、外部服务调用必须考虑权限、隔离、超时、重试与审计。

### 测试

- 测试行为而非实现细节：优先贴近用户行为的组件/集成测试，纯逻辑用单元测试覆盖。
- 禁止只靠快照；快照必须配合显式断言。
- 修 bug 先写复现测试，再修。
- 用例命名表达意图，如「导入含重复 id 的 JSON 时应跳过并提示行号」。
- 测试应可独立运行、不依赖顺序、不共享可变状态；测试数据隔离，不依赖生产数据。
- 关键 API、模块边界、公共契约应有契约测试或等价验证。
- 交互组件应覆盖键盘、焦点、基本可访问性路径。

### 性能

- 列表渲染用稳定 key，禁止用 index 作为可变列表的 key。
- 渲染路径内不做昂贵计算；交给缓存或移出渲染。
- 高频事件（输入/滚动/resize）防抖或节流；超长列表虚拟化；路由/组件/图片按需加载。
- 禁止循环内逐条发起可合并的请求（N+1）。
- 关注包体积预算、首屏、Core Web Vitals；图片、字体、脚本、样式有优化与缓存策略。
- 数据库查询关注索引、N+1、全表扫描、连接池与慢查询。

### 可观测性

- 日志分级、结构化，关键路径带请求/trace id；错误上报带 source map。
- 埋点有命名规范，不采集敏感信息。
- 告警有负责人、阈值和处理手册；避免无行动告警。
- 关键业务与安全事件可审计。

### 依赖与供应链治理

- 引入依赖前评估：已有依赖能否解决、维护活跃度、许可证、包体积、安全记录、供应链风险，在 commit/PR 中说明理由。
- 锁文件必须提交，升级依赖需跑完整验证，不擅自升级或改动 lockfile。
- 定期审计依赖；必要时生成 SBOM；CI 权限最小化。
- 不长期保留废弃依赖；迁移完成后删除。

## 设计原则

- KISS：简单直接优先，不为「看起来优雅」增加实际复杂度。
- DRY：消除重复，但抽象等到同一模式第三次出现且形态稳定时再提取；完全相同的小段可提前抽取；不为 1–2 处小重复强行造抽象。
- SOLID：职责单一、依赖抽象而非实现、开闭原则；不为套用而套用。
- YAGNI：不添加当前用不到的抽象层、配置项、扩展点；简单方案满足需求就不升级。
- 渐进式演进：从最小可工作版本开始，每次改动建立在已验证可运行的系统之上，不做未经验证的提前架构设计。
- 不做长期兼容包袱：内部旧方案确认迁移完成后直接删除；公共契约走弃用周期，不叠加无限期 fallback。
- 不牺牲当前可用性：永不用「未来可能需要的复杂性」换取当前可用性下降。

## 提交前自检

- [ ] 需求与验收标准明确，无静默假设。
- [ ] 文件/函数行数、嵌套达标；无硬编码视觉值、死代码、静默失败、调试残留、敏感信息。
- [ ] lint / 类型检查 / 相关测试 / 构建全部通过，用「项目信息」中的命令。
- [ ] 安全、隐私、可访问性、国际化、性能影响已评估。
- [ ] 新增用户可见文案已走 i18n / 文案常量。
- [ ] 交互可键盘操作、有可访问名称；弹窗类组件焦点与 ESC 行为正确。
- [ ] 网络请求处理了加载/失败/空三态，必要时有超时、取消与重试。
- [ ] 数据迁移、API 契约、缓存策略变更已评估兼容性与回滚。
- [ ] 改动最小化：无关格式化与无关重构已剥离。
- [ ] 对外行为/API 变化已同步文档与 CHANGELOG；公共契约变更是否需要走弃用流程。
- [ ] commit message 符合规范。
- [ ] AI 代理未伪造验证结果；无法验证处已说明原因与风险。

## Git 提交规范

基于 Conventional Commits，正文逐文件说明改动。琐碎提交（typo、纯格式、文档小改、批量机械改动、锁文件、自动生成文件）可省略或合并说明。

### 格式

```
<type>(<scope>): <subject>

- <path/to/file>: <改动内容，到方法/组件级>
- <path/to/file>: <改动内容，到方法/组件级>

[可选补充说明]
[可选 footer：BREAKING CHANGE: ... / Closes #123]
```

- `subject`：祈使句、无句号、可中文，≤ 50 字符（中文建议 ≤ 25 字）。
- 正文至少一条 `- 路径: 改动` 行，写「做了什么」而非「文件是什么」。
  - ✅ `user-provider.tsx: 新增 importUsers()，经 nextId 防 id 冲突`
  - ❌ `修改了 users 模块文件`
- `style` 指代码格式（不影响逻辑）；CSS/UI 样式改动归入 `feat`/`fix`/`refactor`。
- 提交应原子化，一个提交只做一件事；不提交 WIP、调试代码、生成物或大文件。

### type

| type | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 修 bug |
| `refactor` | 不改行为的重构 |
| `perf` | 性能优化 |
| `test` | 测试 |
| `docs` | 仅文档 |
| `style` | 纯格式（不影响逻辑） |
| `build` | 构建配置、依赖变更 |
| `ci` | CI 配置 |
| `chore` | 杂项 |
| `revert` | 回退 |

### scope

scope 取业务模块 id（清单见「项目信息」）或基础设施 id。通用基础设施 scope：

| scope | 范围 |
| --- | --- |
| `theme` | 主题引擎 / 设计令牌 |
| `ui` | 通用组件 |
| `i18n` | 国际化、locales |
| `db` | 数据库、持久化、迁移 |
| `infra` | 构建 / CI / 脚本 |
| `docs` | 跨多文档或文档规范 |
| `auth` | 认证、授权、会话 |
| `api` | 接口层、契约定义 |

### 示例

```
feat(users): 支持粘贴 JSON 批量导入用户

- modules/users/components/import-dialog.tsx: 新增导入对话框（textarea 粘贴 + 逐条 schema 校验，错误行号反馈）
- modules/users/user-provider.tsx: 新增 importUsers()，经 nextId(existing) 生成不冲突的 USER-<n> id
- modules/users/locales.ts: 补导入对话框三语文案
```

```
fix(theme): 修复暗色切换时派生 CSS 变量不重放

- context/theme-provider.tsx: MutationObserver 回调改读 configRef.current，保证 class 翻转时应用最新配置
```

## 例外流程

- 安全、正确性、可访问性相关 MUST：不允许例外，不可降级。
- 其他 MUST 例外：必须有 issue、负责人、到期日、评审记录和替代方案，经代码负责人与安全负责人书面确认后方可临时妥协，限期修复。
- SHOULD 例外：在 PR 或提交说明中写清原因、影响和回收计划即可，无需额外审批。
- 例外到期未处理，视为技术债，必须进入迭代计划；重复例外应转为自动化门禁或规范修订。
- 例外记录应可检索，避免口头豁免和永久临时方案。

## 自动化建议

能用工具强制的，不靠人记：

- ESLint / TypeScript / Prettier / Stylelint 或对应语言等价工具。
- commitlint / lint-staged。
- 单元、集成、e2e 测试。
- 依赖审计、许可证检查、SBOM、包体积预算。
- a11y 检查、i18n 检查、死代码检查。
- 自定义门禁脚本：拦截无注释空 catch、禁止原生弹窗、禁止深路径引用等。
- CI 门禁：静态检查 + 类型检查 + 测试 + 构建。
- 分支保护、必需评审、CI 权限最小化、密钥扫描。

## 项目信息（落地必须填写）

> 全文件唯一需按项目修改的章节。正文规范均引用此处。不适用填「不适用」，不留空。

- 技术栈：TypeScript 5.9 + React 19 + Zustand 5 + Tailwind CSS 4 + CodeMirror 6 + markdown-it（含 KaTeX/Mermaid/Prism）前端；Cloudflare Workers + Hono 4 后端（D1/FTS5、R2 或 Workers KV、KV OAuth、Durable Objects、可选 Workers AI）；Zod 4 校验；远程 MCP 服务 + OAuth 2.1/PKCE。Vite 8（rolldown）构建，Vitest 4 测试。`blog-frontend/` 为独立 Astro 7 + React 19 + Tailwind 4 博客前台。
- 运行环境：Node ^24.15.0 + npm（锁文件为 `package-lock.json`，必须提交）。应用运行于 Cloudflare Workers，`compatibility_date = 2026-05-01`，`compatibility_flags = ["nodejs_compat", "global_fetch_strictly_public"]`。本地经 `@cloudflare/vite-plugin` 的 workerd 运行，默认 http://localhost:7712；`blog-frontend/` 要求 Node >= 22.12.0，开发端口 4321。
- 常用命令：
  - 安装：`npm ci`（仓库根）；`cd blog-frontend && npm ci`
  - Lint：主项目无 ESLint，由 `npm run style:check` 等门禁脚本承担；`blog-frontend` 用 `npm run lint`（`scripts/agents-lint.mjs`）
  - 类型检查：`npm run typecheck`（`tsc -b`，client/worker/node 三项目）；`blog-frontend`：`npm run typecheck`（`astro check`）
  - 测试：`npm run test:unit`（Vitest 单元/集成）；watch：`npx vitest --config vitest.config.ts`；`blog-frontend`：`npm test`
  - 构建 / 开发：`npm run dev`（R2）、`npm run dev:kv`（KV）、`npm run dev:demo`（纯前端体验版）；`npm run build` / `build:kv` / `build:demo`、`npm run preview`；`blog-frontend`：`npm run dev` / `build` / `preview`
  - 自定义门禁脚本：`style:check`、`size:check`、`comments:check`、`escape:check`、`empty-catch:check`、`hardcoded:check`、`tokens:check`、`i18n:check`、`module-state:check`、`deep-imports:check`、`vendor:check`、`budget:check`；`blog-frontend` 复用 `size:check:blog`、`deep-imports:check:blog`；端到端 `test:e2e`（`scripts/e2e.mjs`、`scripts/e2e-visual.mjs`）
- 业务 scope 清单：auth、notes、folders、tags、search、sync、files/attachments、avatars、backup、settings、share、blog、mcp、graph、templates、transfer、update；基础设施 scope 沿用正文通用表（theme、ui、i18n、db、infra、docs、auth、api），另可用 editor、preview、workspace、sidebar、command、pwa、demo。
- 目录结构要点：`src/client/` React 界面（`components` 通用组件、`editor` 编辑器、`features/<domain>` 业务、`store` Zustand、`lib` 数据层、`styles` 令牌与样式、`demo` 纯前端后端模拟）；`src/shared/` 共享类型、locales、markdown 工具、常量、zip；`src/worker/` Hono 应用（`routes/<domain>`、`db/schema` 迁移与 FTS、`mcp`、`backup`、`attachments`、`realtime`、`durable`、`middleware`、`lib`）；`blog-frontend/` 独立 Astro 站点；`tests/` 跨模块回归 + D1 测试基座；`scripts/` 门禁与端到端脚本；`public/` 静态资源。跨模块只经各目录 `index.ts` 公开入口（`deep-imports:check` 强制）。
- 环境变量：主 Worker 通过 `wrangler.toml` 的 `[vars]`/绑定与 `wrangler secret put`（无根 `.env.example`，`.dev.vars` 已 gitignore）：`APP_NAME`（默认 Inkstone）、`PUBLIC_URL`（OAuth 规范 origin，可选）、`DEV_SEED`（仅 `wrangler.kv.toml` 本地，开启 `/api/dev/seed`）；绑定 `DB`(D1)、`FILES`(R2) 或 `FILES_KV`(KV)、`OAUTH_KV`、`SYNC_HUB`(DO)、`CREDENTIAL_VAULT`(DO)、`AI`(可选)、`ASSETS`。`blog-frontend/.env.example`：`PUBLIC_API_URL`（另有 `window.__INKSTONE_API_URL__` / `<meta name="inkstone-api-url">` 覆盖）。构建/测试：`INKSTONE_EPHEMERAL_DEV=1`、`INKSTONE_CHROME_PATH`、`INKSTONE_VISUAL_USERNAME/PASSWORD`、`BASE_URL`、`SEED_USER/PASS`、`SIZE_LIMITS`。
- 公共契约与弃用策略：接口契约集中在 `src/shared/types/`，请求体经 Zod（`src/worker/lib/request.ts`）在服务端二次校验；导出/备份格式见 `src/shared/backup-format.ts`。公共 API、开放接口与持久化迁移的变更走「deprecation 标记 + 迁移窗口 + 到期删除」，不叠加长期 fallback；历史 `inkstone_session` cookie 与新的 `__Host-inkstone_session` 并存过渡。已应用迁移不可修改。
- 数据迁移：`src/worker/db/schema/migrations.ts` 中带版本号、幂等、只增不改的 SQL，由 `initializeDatabase()` 启动时按 `schema_migrations` 应用；新改动只能追加新 migration，`check-migration-immutability` 与 `tests/schema-migrations.test.ts` 守卫；部署升级前先备份。
- 安全基线：scrypt(N=2^14, r=8, p=5) 密码哈希 + 常量时间比较；会话 token 仅存 SHA-256 摘要，90 天滑动 TTL，`__Host-` cookie；登录失败/IP 递增锁定节流；TOTP 双因素与恢复码。逐响应 nonce 的 CSP（script-src 不用 `unsafe-inline`，当前因可运行 JS 示例保留 `'unsafe-eval'`，见 `SECURITY.md` S1）、HSTS、X-Frame-Options、Referrer-Policy、Permissions-Policy，API 响应 `no-store`。DOMPurify + markdown 渲染闸门；上传校验类型/大小/配额且与执行目录隔离；MCP 走 OAuth 2.1/PKCE 与可撤销 `ink_` Key；密钥不入仓库，前端只放公开配置。
- 可访问性基线：交互控件必须使用 `src/client/components`（primitives、form、overlay 等）基于原生语义元素；Overlay 组件实现焦点陷阱、ESC 关闭、焦点归还与 ARIA；状态变化用 `role="status"`/`aria-live`；颜色由 oklch 令牌保证对比度；`tokens.css` 在 `prefers-reduced-motion: reduce` 下将动效时长归零。当前无自动化 axe/a11y 门禁，靠组件实现与评审保证。
- 国际化范围：主应用 en-US + zh-CN，资源在 `src/shared/locales/{en-US,zh-CN}/*.ts`，运行时按需加载（`src/client/lib/i18n.ts`），`npm run i18n:check` 校验键一致；源码 UI 文案必须使用英文 message id，中文只允许出现在 zh-CN 资源。`blog-frontend` 支持 zh-CN（默认）、zh-TW、en-US（`src/lib/i18n/locales`）。日期/数字用 `Intl`，存储用 UTC。
- 状态与数据获取：客户端用 Zustand：`store/notes`（组合根 + 职责子模块，见 `store/notes/README.md`）、`store/ui`、`store/session`、`store/pwa`、`store/update`、`store/pinned-windows`；网络经 `src/client/lib/api`（transport + 领域模块），展示层不直接请求。离线用 IndexedDB（`src/client/lib/db` + `idb-keyval`）缓存与 outbox 写入队列、乐观更新与回滚、跨标签广播；实时用 `SyncHub` Durable Object + 轮询降级。
- 设计令牌位置：`src/client/styles/tokens.css` 与 `blog-frontend/src/styles/tokens.css`（共享契约，`npm run tokens:check` + `scripts/check-token-drift.baseline.json` 守卫漂移）；z-index 见 `src/client/lib/z-index.ts`；`npm run hardcoded:check` 禁止内联视觉字面量。
- 测试策略：Vitest 双工程（`vitest.config.ts`）：`jsdom` 覆盖客户端与多数测试，`node` 覆盖 worker/D1/demo 测试；同目录 `*.test.ts` + `tests/` 跨模块回归（基座 `tests/d1-harness.ts`，node:sqlite）。以行为为准，修 bug 先写复现；Markdown 渲染用带显式断言的快照；`blog-frontend` 有 markdown 基线与 SSR 冒烟。端到端 `npm run test:e2e`（对 :7712 的全新本地实例）与 `scripts/e2e-visual.mjs`（Puppeteer），CI 以 `INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv` 运行。
- 可观测性：Worker `[observability] enabled = true`，日志用 `console.warn/error` 并带 `[inkstone]`/`[share]` 前缀；`/api/health` 暴露组件就绪状态；Cron `0,15,30,45 * * * *` 执行备份、附件清理、索引与维护；错误响应不泄露堆栈，日志不含密钥/敏感数据；`module-state:check` 保证 Worker 无模块级可变状态。
- 分支与发布：`main` 为稳定/发布分支，`dev` 为集成分支；CI 在 push `main`/`dev` 与全部 PR 上运行。版本唯一来源为根 `package.json`（SemVer，无 `v` 前缀/预发布），构建时嵌入并与上游 `main` 的 package.json 比对以提示更新。发布用 `npm run deploy`（R2）/ `deploy:kv` / `deploy:demo` / `deploy:blog`；提交遵循 Conventional Commits。
- CI 门禁：`.github/workflows/ci.yml` 主任务依次执行 `typecheck`、`test:unit`、`ci-bench-report`、`i18n:check`、`comments:check`、`escape:check`、`empty-catch:check`、`module-state:check`、`deep-imports:check`、`style:check`、`hardcoded:check`、`tokens:check`、`size:check`、`size:check:blog`、`deep-imports:check:blog`、`build`、`check-bundle-budget`、`vendor:check`，再对本地实例跑 `scripts/e2e.mjs` 与 `scripts/e2e-visual.mjs`；`blog-frontend` 任务独立跑 `typecheck`、`lint`、`test`、`build`、smoke。`.githooks/pre-commit` 在本地镜像大部分静态门禁，并对暂存 TS 文件跑增量 `tsc -b` 与 `vitest related`。
- 代码所有者：仓库无 `CODEOWNERS` 文件；上游维护者为 `shuaiplus/inkstone`，本地为 fork（`lgf54470/inkstone`）。所有改动按本文件要求走 PR 评审。