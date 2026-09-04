# Cloudflare 双项目一键部署指南

Inkstone 生态包含两个可独立部署于 Cloudflare 的项目：
1. **主项目（Inkstone）**：基于 Cloudflare Workers + D1 + R2 + Durable Objects 运行的私有双链 Markdown 笔记应用与博客管理后台；
2. **博客前端（blog-frontend）**：基于 Astro 架构构建的高性能静态博客，托管于 Cloudflare Workers (Static Assets) 或 Cloudflare Pages。

---

## 部署流程（推荐三步走）

### 第一步：部署 Inkstone 笔记主系统（后端 API + 管理后台）

1. **登录 Cloudflare**（如尚未登录）：
   ```bash
   npx wrangler login
   ```

2. **初始化 D1 数据库与 R2 存储桶**（首次部署）：
   ```bash
   npx wrangler d1 create inkstone-db
   npx wrangler r2 bucket create inkstone-files
   ```
   > 将生成的数据库 id 填入根目录 `wrangler.toml` 中的 `database_id`。

3. **构建并发布 Inkstone**：
   ```bash
   npm run deploy
   ```
   部署完成后，Cloudflare 将输出分配给 Inkstone 的生产域名，例如：
   `https://inkstone.<your-subdomain>.workers.dev`

---

### 第二步：配置博客前端连接地址

打开 `blog-frontend/wrangler.toml`（或创建 `blog-frontend/.env.production`），将 `PUBLIC_API_URL` 设置为第一步获得的 Inkstone 生产域名：

```toml
#:schema node_modules/wrangler/config-schema.json
name = "inkstone-blog"
compatibility_date = "2026-05-01"

[assets]
directory = "./dist"
not_found_handling = "404-page"
html_handling = "auto-trailing-slash"

[vars]
# 填入第一步中获得的 Inkstone Worker 生产域名
PUBLIC_API_URL = "https://inkstone.<your-subdomain>.workers.dev"
```

---

### 第三步：部署博客前端到 Cloudflare

您可以通过以下两种 Cloudflare 方式之一部署博客前端：

#### 方式 A：通过 Cloudflare Workers (现代 Static Assets 托管 - 推荐)
在根目录或 `blog-frontend` 目录下运行：
```bash
# 在根目录运行
npm run deploy:blog

# 或进入 blog-frontend 目录运行
cd blog-frontend
npm run deploy
```
> 您也可以在正式发布前执行预检（dry-run 校验，不上传）：
> `npm run deploy:blog:check`

#### 方式 B：通过 Cloudflare Pages 部署
如果您更习惯使用 Cloudflare Pages：
```bash
# 在根目录运行
npm run deploy:blog:pages

# 或进入 blog-frontend 目录运行
cd blog-frontend
npm run deploy:pages
```

---

## 自定义域名配置（可选）

如需绑定您自己的独立域名（例如 `notes.example.com` 与 `blog.example.com`）：

1. **Inkstone 笔记与管理后台**：
   - 登录 Cloudflare Dashboard -> **Workers & Pages** -> 选择 `inkstone` -> **Settings** -> **Domains & Routes** -> 添加自定义域名（如 `notes.example.com`）。

2. **博客前端站点**：
   - 登录 Cloudflare Dashboard -> **Workers & Pages** -> 选择 `inkstone-blog` -> **Settings** -> **Domains & Routes** -> 添加自定义域名（如 `blog.example.com`）。
   - 将 `blog-frontend/wrangler.toml` 中的 `PUBLIC_API_URL` 更新为 `https://notes.example.com` 并重新执行 `npm run deploy:blog`。

---

## 常用脚本速查

| 指令 | 说明 |
| :--- | :--- |
| `npm run deploy` | 构建并部署主项目 Inkstone 至 Cloudflare Workers |
| `npm run deploy:check` | 主项目 Inkstone 部署预检（Dry-run） |
| `npm run deploy:blog` | 构建并部署博客前端至 Cloudflare Workers (Assets) |
| `npm run deploy:blog:check` | 博客前端部署预检（Dry-run 校验） |
| `npm run deploy:blog:pages` | 构建并部署博客前端至 Cloudflare Pages |
