# 生产数据库 D1 模式不兼容与缓存脱节致全站 HTTP 500 深度复盘

> **文档创建时间**：2026-09-09  
> **故障发生时间**：2026-09-08  
> **涉及服务**：`inkstone` 核心 Cloudflare Worker (`src/worker/db/schema/*`)  
> **数据库实例**：Cloudflare D1 (`inkstone-db`)  
> **严重级别**：P0（全站阻塞，已登录用户访问首页直接 500）  

---

## 目录

- [一、故障现象与排查困境](#一故障现象与排查困境)
- [二、根本原因深度分析](#二根本原因深度分析)
  - [2.1 为什么浏览器控制台没有任何错误日志？](#21-为什么浏览器控制台没有任何错误日志)
  - [2.2 为什么会抛出 Internal Server Error？](#22-为什么会抛出-internal-server-error)
  - [2.3 为什么 version 24 迁移没有自动补齐缺失字段？](#23-为什么-version-24-迁移没有自动补齐缺失字段)
  - [2.4 database-state-v1 指纹缓存在其中的角色](#24-database-state-v1-指纹缓存在其中的角色)
- [三、已执行的修复操作（无损数据平滑对齐）](#三已执行的修复操作无损数据平滑对齐)
- [四、如何在部署时自动化检查与清除缓存（长效机制）](#四如何在部署时自动化检查与清除缓存长效机制)
  - [4.1 方案架构：预部署 D1 模式校验门禁 (Pre-deploy Schema Gate)](#41-方案架构预部署-d1-模式校验门禁-pre-deploy-schema-gate)
  - [4.2 检查脚本实现：scripts/check-d1-schema.mjs](#42-检查脚本实现scriptscheck-d1-schemamjs)
  - [4.3 部署流程整合：在 npm run deploy 中自动联动](#43-部署流程整合在-npm-run-deploy-中自动联动)
- [五、数据库迁移后续避坑核心守则](#五数据库迁移后续避坑核心守则)

---

## 一、故障现象与排查困境

### 1. 现象
用户在浏览器访问生产环境根路径 `https://inkstone.333096.xyz/` 时，页面无法呈现笔记本 SPA 应用，而是直接收到来自 Cloudflare Worker 的原始 JSON 响应：
```json
{
  "error": {
    "code": "internal",
    "message": "Internal server error"
  }
}
```
HTTP 状态码为 `500 Internal Server Error`。

### 2. 排查困境
开发者打开浏览器 DevTools 控制台，发现**没有任何前端控制台错误信息**，也没有任何 JavaScript 报错堆栈。

---

## 二、根本原因深度分析

### 2.1 为什么浏览器控制台没有任何错误日志？

在 `wrangler.toml` 的路由配置中：
```toml
[assets]
directory = "./dist/client"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = [
  "/",
  "/index.html",
  "/api",
  "/api/*",
  ...
]
```
- `run_worker_first` 包含了 `"/"` 与 `"/index.html"`。这意味着当用户访问站点根路径时，请求**首先由 Worker 处理**，而不是由 Cloudflare Assets 静态资源服务器直接返回 HTML。
- 在 Worker 的处理链路中，当捕获到底层抛出的致命未捕获异常时，全局错误处理中间件 `app.onError` 拦截了异常，并将响应内容格式化为 `application/json` 类型的错误体返回：
  ```typescript
  return c.json({ error: { code: 'internal', message: 'Internal server error' } }, 500)
  ```
- **结论**：浏览器收到了纯 JSON 响应，根本没有机会下载 `index.html`，更没有执行任何 SPA 客户端 JavaScript 代码。因此浏览器控制台呈现一片空白，没有任何前端堆栈。

---

### 2.2 为什么会抛出 Internal Server Error？

在 `src/worker/app.ts` 中，对根路径 `"/"` 的请求会经过鉴权与环境上下文处理：
```typescript
async function viewerAllowsExternalImages(c: Context<AppBindings>): Promise<boolean> {
  const token = getCookie(c, SESSION_COOKIE) ?? getCookie(c, LEGACY_SESSION_COOKIE)
  if (!token || !isSessionToken(token)) return false

  // 关键调用：已登录用户访问根路径时，触发数据库初始化与架构完整性校验
  await initializeDatabase(c.env)
  ...
}
```

当已登录用户访问根路径时，Worker 触发了 `initializeDatabase(c.env)` -> `createSchema(env.DB)`：
1. `readStoredDatabaseState(db)` 读取 `app_meta` 中的 `database-state-v1` 指纹。因为代码更新导致 `schemaFingerprint()` 变动，缓存未命中；
2. 数据库执行增量收敛流程：`applyMigrations(db)`；
3. 执行架构防御性断言：`await assertFinalSchema(db)`；
4. 在 `assertFinalSchema(db)` 中，系统比对 `REQUIRED_COLUMNS` 中 `blog_links` 表必须包含的字段：
   ```typescript
   blog_links: [
     'id', 'user_id', 'name', 'url', 'description', 'avatar',
     'email', 'category_id', 'status', 'is_pinned', 'pinned_order',
     'sort_order', 'is_active', 'clicks', 'created_at', 'updated_at'
   ]
   ```
5. 检查结果发现生产环境的 `blog_links` 表**缺失了 `name`, `status`, `pinned_order`, `is_active`, `clicks` 字段**！
6. `assertFinalSchema` 抛出显式防御异常：
   ```text
   The database schema is incompatible (blog_links is missing name, status, pinned_order, is_active, clicks)
   ```
7. 该异常直接向上冒泡至 `app.onError`，导致全站返回 HTTP 500。

---

### 2.3 为什么 version 24 迁移没有自动补齐缺失字段？

这是本故障**最核心的深层根因**：

1. **迁移执行机制**：
   在 `src/worker/db/schema/runtime.ts` 的 `applyMigrations` 中：
   ```typescript
   const { results } = await db.prepare(`SELECT version FROM schema_migrations`).all<{ version: number }>()
   const applied = new Set(results.map((row) => row.version))

   for (const migration of SCHEMA_MIGRATIONS) {
     if (applied.has(migration.version)) continue // 关键逻辑：如果已记录此版本，直接跳过！
     ...
     await db.batch(statements)
   }
   ```
2. **迁移不可变性破损（Mutation of an Applied Migration）**：
   - 远程生产数据库 `inkstone-db` 在之前的迭代测试中，**已经执行过早期版本的 version 24 迁移**，并在 `schema_migrations` 表中写入了 `version: 24`；
   - 当时早期建表语句使用的是旧字段（如 `title`、`is_visible`、`click_count` 等）；
   - 后续在代码重构中，开发者**直接在代码里的 version 24 中修改了字段名**（改为 `name`、`status`、`pinned_order` 等），而**没有递增版本号创建新的 version 25**；
   - 生产数据库启动时查询 `schema_migrations`，发现已有 `version: 24`，因此判定"version 24 已应用"，**直接跳过了执行**；
   - 结果：生产表依然保留旧字段，新字段从未被创建，随后在 `assertFinalSchema` 发生校验崩溃。

---

### 2.4 database-state-v1 指纹缓存在其中的角色

`app_meta` 表中的 `database-state-v1` 记录了：
```json
{
  "schema": "a1b2c3d4",
  "ftsEnabled": true
}
```
- **作用**：当指纹与当前代码的 `schemaFingerprint()` 一致时，跳过耗时的 D1 PRAGMA 检查与迁移比对，提升冷启动性能。
- **脱节风险**：如果在外部通过 SQL 手动修补了数据库字段或表结构，但没有清除或更新 `database-state-v1`，或者指纹由于某种原因未能刷新，Worker 就无法重新触发完整的模式收敛校验。

---

## 三、已执行的修复操作（无损数据平滑对齐）

为了不丢失用户已有的友链与分类数据，我们直接对远程生产库 `inkstone-db` 执行了平滑数据迁移对齐：

1. **补齐 `blog_links` 字段并无损映射旧数据**：
   ```sql
   ALTER TABLE blog_links ADD COLUMN name TEXT NOT NULL DEFAULT '';
   UPDATE blog_links SET name = title WHERE name = '' AND title IS NOT NULL;
   ALTER TABLE blog_links ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';
   ALTER TABLE blog_links ADD COLUMN pinned_order INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE blog_links ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
   ALTER TABLE blog_links ADD COLUMN clicks INTEGER NOT NULL DEFAULT 0;
   ```
2. **补齐 `blog_link_categories` 字段并保留排序**：
   ```sql
   ALTER TABLE blog_link_categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
   UPDATE blog_link_categories SET sort_order = position WHERE sort_order = 0 AND position IS NOT NULL;
   ```
3. **重建生产索引**：
   ```sql
   CREATE INDEX IF NOT EXISTS idx_blog_links_user ON blog_links(user_id, status, is_pinned DESC, sort_order ASC, created_at ASC);
   CREATE INDEX IF NOT EXISTS idx_blog_link_categories_user ON blog_link_categories(user_id, sort_order ASC);
   ```
4. **清除指纹缓存**：
   ```sql
   DELETE FROM app_meta WHERE key = 'database-state-v1';
   ```
   清理后，Worker 下次接收请求时重新触发完整的架构断言校验，确认所有表与字段齐全，全站成功恢复正常。

---

## 四、如何在部署时自动化检查与清除缓存（长效机制）

用户核心诉求：
> **"如何避免后续再次出现？清除 app_meta 中的 database-state-v1 指纹缓存，使 Worker 重新校验收敛。可以在部署的时候检查吗？"**

**答案：完全可以，而且应当作为部署流水线（Pre-deploy Gate）的强制自动化步骤！**

### 4.1 方案架构：预部署 D1 模式校验门禁 (Pre-deploy Schema Gate)

在执行 `wrangler deploy` 将新代码推向生产之前，先运行本地预检脚本与远程 D1 通信：

```
[npm run deploy]
       │
       ▼
步骤 1: 运行代码构建与类型检查 (tsc -b && vite build)
       │
       ▼
步骤 2: [新增预检门禁] node scripts/check-d1-schema.mjs --remote
       ├── 检查 D1 实际所有表是否存在 (REQUIRED_TABLES)
       ├── 检查 D1 各表实际所有列是否存在 (REQUIRED_COLUMNS)
       ├── 检查 D1 所有必要索引是否存在 (REQUIRED_INDEXES)
       └── 若检测到代码有 schema 变更，自动清除/更新 database-state-v1 缓存
       │
       ├─── 校验不通过 ──► [终止部署！报警提示缺失的 migration]
       ▼
       通过
       ▼
步骤 3: 执行实际部署 (wrangler deploy)
       │
       ▼
生产流量接入（100% 确保新 Worker 启动时 assertFinalSchema 绝不抛错！）
```

---

### 4.2 检查脚本实现：`scripts/check-d1-schema.mjs`

我们可以编写一个自动化的 D1 预检脚本。核心逻辑如下：

```javascript
// scripts/check-d1-schema.mjs
import { execSync } from 'node:child_process'
import { REQUIRED_COLUMNS, REQUIRED_INDEXES, REQUIRED_TABLES } from '../src/worker/db/schema/checks.ts'

const isRemote = process.argv.includes('--remote')
const flag = isRemote ? '--remote' : '--local'
const dbName = 'inkstone-db'

function runD1(sql) {
  const cmd = `npx wrangler d1 execute ${dbName} ${flag} --json --command "${sql.replaceAll('"', '\\"')}"`
  const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] })
  return JSON.parse(output)[0].results
}

async function verifySchema() {
  console.log(`🔍 [D1 预检] 正在验证 ${isRemote ? '生产' : '本地'} D1 数据库架构完整性...`)

  // 1. 验证表
  const tables = new Set((runD1("SELECT name FROM sqlite_master WHERE type = 'table'")).map(r => r.name))
  for (const table of REQUIRED_TABLES) {
    if (!tables.has(table)) {
      throw new Error(`❌ 缺少数据表: ${table}`)
    }
  }

  // 2. 验证列
  for (const [table, cols] of Object.entries(REQUIRED_COLUMNS)) {
    const existing = new Set((runD1(`PRAGMA table_info(${table})`)).map(r => r.name))
    const missing = cols.filter(c => !existing.has(c))
    if (missing.length > 0) {
      throw new Error(`❌ 表 ${table} 缺少必要字段: ${missing.join(', ')}。请检查是否缺失增量迁移！`)
    }
  }

  // 3. 验证索引
  const indexes = new Set((runD1("SELECT name FROM sqlite_master WHERE type = 'index'")).map(r => r.name))
  for (const idx of REQUIRED_INDEXES) {
    if (!indexes.has(idx)) {
      console.warn(`⚠️ 缺少推荐索引: ${idx}`)
    }
  }

  // 4. 清除或重置 database-state-v1 缓存
  console.log('🧹 [D1 预检] 清理 app_meta 中的 database-state-v1 缓存，确保新版本强制收敛...')
  runD1("DELETE FROM app_meta WHERE key = 'database-state-v1'")

  console.log('✅ [D1 预检] 数据库架构与代码完全兼容，允许部署！')
}

try {
  verifySchema()
} catch (err) {
  console.error(`\n🚨 部署前校验失败: ${err.message}\n`)
  process.exit(1)
}
```

---

### 4.3 部署流程整合：在 `package.json` 中自动联动

在根目录 `package.json` 中配置部署前置钩子：
```json
{
  "scripts": {
    "db:check:prod": "node scripts/check-d1-schema.mjs --remote",
    "deploy": "npm run db:check:prod && npm run build && npx wrangler deploy --config dist/inkstone/wrangler.json"
  }
}
```
这样：
1. 任何人在执行 `npm run deploy` 时，都**必须先通过远程 D1 的列与表一致性比对**；
2. 如果代码里增加了新字段但忘了写新 migration，或者迁移没在远程执行，**部署会在本地立即被阻断**，防止带伤上线；
3. 校验通过时会自动清空 `database-state-v1`，确保部署后的新 Worker 实例能够平稳完成启动收敛。

---

## 五、数据库迁移后续避坑核心守则

1. **迁移版本不可变原则（Migration Immutability）**：
   - 严禁修改已经发布或在任意远程环境执行过的 Migration 文件；
   - 任何字段变更、类型修改或索引调整，一律**递增版本号，新建 `version: N+1` 迁移项**。
2. **增量平滑迁移（Additive Migrations）**：
   - 使用 `skipIfColumnExists: { table: '...', column: '...' }` 防御重复执行错误；
   - 避免直接 DROP 表，重命名字段时采用"增加新列 -> 搬迁数据 -> 废弃旧列"的三步法。
3. **部署与迁移顺序规范**：
   - 先确保数据库具备向后兼容性（Backward-compatible Schema）；
   - 执行模式预检与指纹缓存刷新；
   - 再部署新版业务代码。
