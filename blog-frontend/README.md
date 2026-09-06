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
npm run build      # 生产构建到 dist/
npm run preview    # 本地预览构建产物
npm run typecheck  # Astro/TS 类型检查（astro check）
npm run lint       # AGENTS.md 铁律 lint
npm test           # 单元测试（vitest run）
```

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
