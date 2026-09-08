# Inkstone Blog Frontend（blog-frontend）

基于 **Astro 7 + React 19 + Tailwind CSS 4** 构建的高性能博客前台，与 Inkstone 笔记系统配套：后端内容由 Inkstone Worker 的公开 API 提供，排版样式与笔记预览保持一致。

## 功能特性

- 文章列表（含置顶、封面、阅读量）、分页
- 文章正文：Markdown 全语法（含 Mermaid 图表、Chart.js、KaTeX 公式、Obsidian 风格 callout / 双链 / 任务列表等），渲染结果与 Inkstone 客户端预览一致
- 发文日历、时间轴归档、分类、标签、全站即时搜索
- 外观偏好：7 款强调色、浅色/深色/跟随系统、纸感/纯白底色、舒适/紧凑密度（基于设计令牌 `src/styles/tokens.css`）
- 评论：展示与提交（支持审核后显示）

## 技术栈

| 层 | 选择 |
| --- | --- |
| 框架 | [Astro](https://astro.build)（`output: server` + Cloudflare 适配器） |
| 交互组件 | React 19（`@astrojs/react`，`client:load` / `client:visible`） |
| 样式 | Tailwind CSS 4 + CSS 变量设计令牌 |
| Markdown | markdown-it 及扩展插件 + 自研 Obsidian 风格规则 |
| 图表 | Mermaid、Chart.js、KaTeX、Prism |

## 目录结构

```text
blog-frontend/
├── src/
│   ├── components/   # Astro 与 React 组件
│   ├── layouts/      # 页面布局 Layout.astro
│   ├── lib/          # API 客户端、数据规范化、markdown 渲染、外观配置
│   ├── pages/        # 路由页面
│   └── styles/       # tokens.css + prose 排版样式
├── scripts/          # agents-lint（AGENTS.md 铁律可执行子集）
├── tests/            # vitest：markdown 基线快照 / API / 组件 SSR 冒烟
├── astro.config.mjs
└── package.json
```

## 常用命令

在 `blog-frontend` 目录下执行：

```bash
npm install        # 安装依赖
npm run dev        # 启动开发服务器（默认 http://localhost:4321）
npm run dev:alt    # 开发回退方案：build + preview（见下方已知问题）
npm run build      # 生产构建到 dist/
npm run preview    # 本地预览构建产物
npm run typecheck  # Astro/TS 类型检查（astro check）
npm run lint       # AGENTS.md 铁律 lint
npm test           # 单元测试（vitest run）
npm run smoke:e2e  # 对运行中的 preview 服务器做端点冒烟（配合 CI）
```

### 已知问题：`astro dev` 下 workerd 模块解析崩溃

`npm run dev`（Astro dev + `@cloudflare/vite-plugin` 的 workerd 运行时）在当前依赖组合下存在上游集成崩溃：请求任何页面都报 `workerd ... Unable to resolve [.../src/components/*.tsx]`，页面返回截断 HTML。已排查确认与项目代码无关（还原历史版本同样复现；清 vite 缓存 / workerd 持久状态 / 移除 Tailwind 插件均无效），且**生产构建与 `npm run preview` 完全正常**。

日常开发请使用等效回路：`npm run dev:alt`（构建后由 wrangler 本地运行，SSR 与静态资产行为与生产一致；无 HMR，改代码后重新执行即可）。

部署请见仓库根目录 `DEPLOYMENT.md`（Cloudflare Workers Static Assets / Pages 双方案）。

## 环境配置

后端 API 地址按以下优先级读取（见 `src/lib/api.ts`）：

1. 页面注入的 `window.__INKSTONE_API_URL__` 或 `<meta name="inkstone-api-url">`
2. `PUBLIC_API_URL` 环境变量
3. `DEFAULT_API_URL`（`src/lib/constants.ts` 中的兜底值）

本地调试可复制 `.env.example` 为 `.env` 并填写本地 Worker 地址；`.env` 已被 gitignore，请勿提交。

## 开发约束

- 代码须遵守仓库根目录 `AGENTS.md`：单文件 ≤ 500 行、单函数 ≤ 50 行、令牌化样式、无 `any`/空 catch/死代码等铁律
- 修改 markdown 渲染逻辑后运行 `npm test`，`markdown-baseline` 快照会校验渲染 HTML 逐字节稳定
- 重构 React 组件后运行 `npm test`，`tests/components-ssr.test.ts` 做 renderToString 冒烟校验
