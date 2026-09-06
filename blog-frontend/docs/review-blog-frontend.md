# blog-frontend 代码评审报告

评审范围：`blog-frontend`（Astro + Cloudflare Workers 服务端渲染博客）。
评审方式：结合安全基线（主应用 DOMPurify 白名单、CSP 配置）对渲染链路、
交互执行链路与部署配置的静态审查；每项发现按严重级别记录修复状态。

状态图例：✅ 已修复（含提交）｜🔄 进行中 ｜⬜ 未修复

---

## 发现总览

| # | 级别 | 标题 | 状态 |
| --- | --- | --- | --- |
| 1 | 🔴 Critical | 文章 HTML 服务端未净化，存储型 XSS 直达 `set:html` | ✅ 已修复（`6b6b49a`） |
| 2 | 🟠 High | javascript-example 在主线程 `new Function` 执行文章代码 | ✅ 已修复（`2d2b9e5`） |
| 3 | 🟡 Medium | md-example 围栏递归渲染无深度上限，可栈溢出 DoS | ✅ 已修复（`9aa3e25`） |
| 4 | 🟢 Low | 每次请求重建 MarkdownIt 实例，插件注册开销重复 | ✅ 已修复（`9aa3e25`） |
| 5 | ⚪ Info | sanitize-html 依赖 postcss（Node 内置模块），Worker 需 `nodejs_compat` | ✅ 已修复（`1ce3272`） |

---

## 1. 🔴 Critical — 存储型 XSS：文章 HTML 服务端未净化

**位置（修复前）**
- `blog-frontend/src/pages/posts/[slug].astro:126` — `<article ... set:html={html} />`
- `blog-frontend/src/lib/markdown/render-markdown.ts` — `renderMarkdown()` 直接返回 markdown-it 输出
  （`html: true` 允许作者原始 HTML 透传），全程无净化步骤。

**风险**
博客文章内容来自主应用 API，任何可发布文章的账号（或后续接入的投稿/评论富文本）
都能写入 `<script>`、`<img onerror>`、`<iframe srcdoc>`、`javascript:` 链接等载荷；
`set:html` 原样注入 DOM，访问者浏览器直接执行——经典存储型 XSS，可窃取会话、
篡改页面、发起评论伪造等。现有 CSP（`script-src 'self' 'unsafe-inline'`）只拦截
外部脚本源，拦不住内联脚本，仅能作为纵深防御，不能作为唯一防线。

**修复（`6b6b49a`）**
- `blog-frontend/src/lib/markdown/sanitize.ts` — 新增 `sanitizeProseHtml()`：
  以纯 JS 的 sanitize-html（htmlparser2 驱动，Cloudflare Workers 无 DOM 亦可运行）
  镜像主应用 `src/client/lib/markdown/sanitize.ts` 的 DOMPurify PROSE_CONFIG 白名单。
  差异仅三处并附注释说明：`input`（任务复选框服务端直接产出）、`label`
  （js-example 行号开关）、`span/svg/path` + `allowedStyles` 白名单
  （KaTeX 服务端渲染的布局内联样式，属性值严格校验，其余标签一律剥离 `style`）。
  `transformTags` 为 `target="_blank"` 的链接补 `rel="noopener noreferrer"`
  （对应主应用 DOMPurify 的 `afterSanitizeAttributes` hook）。
- `blog-frontend/src/lib/markdown/render-markdown.ts:217` — `sanitizeProseHtml(md.render(...))`，
  净化成为渲染管线的强制出口；md-example 嵌套预览在各自递归层净化，外层再净化一次，
  已由幂等性测试验证。
- CSP（`blog-frontend/src/middleware.ts`）保持不变，继续作为纵深防御。
- 测试：`sanitize.test.ts` 26 例（XSS 载荷/幂等/白名单保持/KaTeX 样式）、
  基线快照更新仅涉及含原始 HTML 透传的用例。

**残余风险**：`sanitize-html` 的 `CVE-2026-40186`（nonTextTags 元素实体解码绕过）
仅影响把 `option`/`textarea` 放入 allowedTags 的配置，本白名单不含二者，不受影响；
后续升级依赖时需复核。净化输出仍允许 `data:` 图片与协议相对 URL（与主应用一致）。

---

## 2. 🟠 High — javascript-example 在主线程执行文章代码

**位置（修复前）**
- `blog-frontend/src/lib/interactive.ts:100-136` — `runUserCode()` 在页面主线程
  `new Function('console', code)`（第 118 行）执行代码。

**风险**
- 文章代码拥有父页面完整权限：可读写 DOM、Cookie、localStorage、IndexedDB，
  可向任意地址发请求（外联数据、篡改页面）。
- `while (true)` 死循环直接冻结整个标签页（主线程无抢占手段，定时器看门狗会被饿死）。

**修复（`2d2b9e5`）**
- `js-runner-core.ts:54` — `executeUserCode()`：执行核心只回传可序列化结果
  （日志/返回值/错误均为字符串）；将 `fetch`/`indexedDB`/`WebSocket`/`postMessage`
  等网络、存储、通信全局遮蔽为 `undefined` 作为纵深防御。
- `js-runner-worker.ts` — 同源打包 Worker 入口，符合现有 CSP（`script-src 'self'`）
  无需放宽任何策略。
- `js-runner-runner.ts:22` — `runUserCode()`：Worker 生命周期 + 硬超时
  （`JS_RUN_TIMEOUT_MS = 2000`，`constants.ts`），超时 `worker.terminate()`
  是唯一能真正中断死循环的手段（独立线程可被抢占）；永不 reject，
  任何失败收敛为带 `errorText` 的 outcome。
- `js-runner-runner.ts:86` — `createJsExampleFrame()`：输出面板改为
  `sandbox="allow-scripts"`（无 `allow-same-origin` → 不透明源）的隔离 iframe，
  日志行只经 `textContent` 写入（`js-runner-frame.ts`），即使未来渲染回归
  也被限制在不透明源文档内；主题色由父页面读取设计令牌注入，无硬编码颜色。
- 为何不直接在 iframe 内执行代码：iframe 与父页面共享主线程，死循环无法被
  抢占；嵌套 Worker 又受 CSP（`blob:`）与不透明源 CORS 双重限制。
- 测试：`js-runner-core.test.ts`、`js-runner-runner.test.ts`（超时终止/崩溃收敛/
  沙箱属性/行构建）、`interactive.test.ts` 运行按钮端到端。

**残余风险**：Worker 与博客同源，代码仍可经 `globalThis` 迂回触达 `fetch` 等能力
（无 DOM、无父页面引用是主防线，全局遮蔽是纵深）；`setTimeout` 等异步回调在
Worker 终止后不会执行，demo 仅支持同步代码。若未来博客出现需登录的接口，
需重新评估 Worker 同源权限面。

---

## 3. 🟡 Medium — md-example 围栏递归渲染无深度上限

**位置（修复前）**
- `blog-frontend/src/lib/markdown/render-markdown.ts:74-75` —
  `renderMarkdownExampleFence()` 对围栏内容调用 `renderMarkdown(code)` 递归渲染。

**风险**
恶意文章可构造 `~~~md-example` 无限嵌套（每一层内容再包一层围栏），
服务端渲染时无限递归直至栈溢出，单请求即可打满 Worker CPU/内存（DoS）。
围栏内容本身是原始文本，嵌套需要逐层构造，但成本极低，可自动化生成。

**修复（`9aa3e25`）**
- `render-markdown.ts:28` — `MAX_MD_EXAMPLE_DEPTH = 4`（与主应用 embeds `MAX_DEPTH=4` 对齐）。
- `render-markdown.ts:180` — `renderFence()` 计算 `env.mdDepth + 1`，超限层不再递归，
  降级为普通代码块展示源码（内容保留、预览消失）。
- 测试：`semantics.test.ts` 深度护栏用例（5 层嵌套 → 4 层预览 + 1 层降级代码块）。

---

## 4. 🟢 Low — 每次请求重建 MarkdownIt 实例

**位置（修复前）**
- `blog-frontend/src/lib/markdown/render-markdown.ts:198` —
  `const md = createMarkdownRenderer(headings)` 每次 `renderMarkdown()` 调用都
  重建实例并重新注册全部插件与规则；`registerCoreRules(md, headings)` /
  `registerRendererRules(md, headings)` 闭包捕获每次调用的 headings 数组。

**风险**
高并发下每个请求重复执行十多个插件的注册开销；闭包捕获模式也阻碍实例复用。

**修复（`9aa3e25`）**
- `render-markdown.ts:197` — 模块级单例 `const md = createMarkdownRenderer()`，
  插件只注册一次。
- `types.ts` — 新增 `RenderEnv`（headings/mdDepth），每次渲染的状态全部走
  `md.render(content, env)` 的 env；`rules/core.ts` 的 `collect_headings` 与
  `rules/renderer.ts` 的 `toc` 规则改从 `state.env` 读写，消除闭包捕获。
- 验证：基线快照哈希在重构后保持不变（无行为漂移）；新增复用与
  headings 不串扰测试；嵌套预览的 headings 不外泄到外层目录。

---

## 5. ⚪ Info — sanitize-html 的 postcss 依赖需要 nodejs_compat

**位置**
- `blog-frontend/wrangler.toml` / `wrangler.pages.toml`（修复前无 `compatibility_flags`）。
- `node_modules/sanitize-html/index.js:6` — 顶层 `require('postcss')`；
  `node_modules/postcss/lib/previous-map.js` 顶层引用 `fs`/`path`/`url`。

**风险**
引入 sanitize-html（发现 1 的修复）后，SSR 打包产物静态依赖 Node 内置模块；
Cloudflare Workers 默认不提供，模块加载即失败，全站 500。构建期
Vite 会告警 "Unexpected Node.js imports"（修复前构建可见）。

**修复（`1ce3272`）**
- 两个 wrangler 配置均新增 `compatibility_flags = ["nodejs_compat"]`，
  `dist/server/wrangler.json` 已确认携带该标志；构建告警消失。
- postcss 实际只在解析 style 属性时使用，且 sanitize-html 以 `map: false` 调用，
  不会触发 previous-map 的文件系统读取。

---

## 修复清单核对

- [x] 每项修复独立提交，提交信息遵循 Conventional Commits（`fix(blog)` / `refactor(blog)` / `build(blog)`）
- [x] 每项修复提交前跑全量回归：`vitest`（120 例）、`agents-lint`、`astro check`、`astro build` 全部通过
- [x] 基线快照测试：发现 1 有意更新（净化改变含原始 HTML 透传用例的哈希）；
      发现 3/4 重构后哈希保持不变，无需重生成
- [x] 根仓库 parity 测试（`tests/markdown-renderer-parity.test.ts`）随提交钩子通过
- [x] CSP 未放宽：Worker 走同源打包产物（`script-src 'self'`），iframe 用 srcdoc 内联脚本（`'unsafe-inline'` 已存在）

## 待跟进（未纳入本次范围）

- ⬜ 低：`img` 的 `srcset` 未放行（sanitize-html 默认不校验 srcset 协议），
  如需支持多分辨率图片需补充协议级校验后加入白名单。
- ⬜ 低：iframe 输出面板的主题在每次运行时读取一次令牌；若运行中切换主题，
  下一次运行才会刷新配色（当前按设计接受）。