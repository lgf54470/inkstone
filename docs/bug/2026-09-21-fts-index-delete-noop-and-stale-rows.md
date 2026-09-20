# FTS 索引删除静默失效致搜索结果陈旧与重复记录复盘

> **文档创建时间**：2026-09-21
> **缺陷引入时间**：2026-09-15（commit `14c86eb9`）
> **涉及服务**：`inkstone` 核心 Cloudflare Worker（`src/worker/db/fts.ts`、`src/worker/db/schema/*`、`src/worker/routes/search/*`）
> **数据库实例**：Cloudflare D1（`notes_fts` FTS5 虚拟表）
> **严重级别**：P1（搜索正确性：编辑过的笔记仍能被旧内容命中，单条笔记在新结果里重复出现）

---

## 目录

- [一、缺陷现象与排查困境](#一缺陷现象与排查困境)
- [二、根本原因深度分析](#二根本原因深度分析)
  - [2.1 FTS5 的 MATCH 只能命中被索引的列](#21-fts5-的-match-只能命中被索引的列)
  - [2.2 为什么删除失效会污染结果](#22-为什么删除失效会污染结果)
  - [2.3 为什么单元测试没有拦住](#23-为什么单元测试没有拦住)
  - [2.4 为什么片段看起来是新的](#24-为什么片段看起来是新的)
- [三、修复方案](#三修复方案)
- [四、验证过程](#四验证过程)
- [五、后续如何避免](#五后续如何避免)

---

## 一、缺陷现象与排查困境

### 1. 现象

`scripts/e2e.mjs` 的断言 `reindex cannot overwrite an editor write with a stale FTS row` 稳定失败（全新实例上 175 通过 / 1 失败，失败信息只有 `reindex=200 edit=200`，两个请求本身都成功）。断言内容为：一边重建索引、一边编辑笔记，随后

- 按**新**内容的关键词搜索：必须能命中该笔记；
- 按**旧**内容的关键词 + 标签过滤搜索：不得再命中该笔记。

### 2. 排查困境

失败信息不含任何错误码，两个 HTTP 请求都是 200；且同样的断言在基线提交 `31a26d14` 上以完全相同的形态失败，说明它与当时在飞的那批音乐改动无关（已用 `git archive` 快照 + 独立端口实例做过对照）。

改用探针脚本（登录、建 4 篇噪声笔记 + 1 篇目标笔记、并发触发重建与编辑、再取两次搜索响应）后，真实现象才暴露出来：

```
round 1: reindex=200({"ok":true,"indexed":21}) edit=200 → fresh=true stale=true FAIL
round 2: reindex=200({"ok":true,"indexed":36}) edit=200 → fresh=true stale=true FAIL   (同一 note id 出现 2 次)
round 3: reindex=200({"ok":true,"indexed":51}) edit=200 → fresh=true stale=true FAIL   (同一 note id 出现 3 次)
```

即：**旧关键词仍然命中**（陈旧），且**同一条笔记在新关键词结果里出现多次**，重复数量随重建次数线性增长。

## 二、根本原因深度分析

### 2.1 FTS5 的 MATCH 只能命中被索引的列

`commit 14c86eb9`（2026-09-15，性能优化）把三处 `notes_fts` 删除从

```sql
DELETE FROM notes_fts WHERE note_id = ?1 AND user_id = ?2 …
```

改成

```sql
DELETE FROM notes_fts WHERE notes_fts MATCH ('note_id : "' || replace(?1,'"','""') || '"')
  AND note_id = ?1 AND user_id = ?2 …
```

其注释写明动机：每次删除都全表扫描，希望改用 FTS 索引定位行。

但生产 schema 自首个版本起就是 `note_id UNINDEXED`：

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  note_id UNINDEXED, user_id UNINDEXED, title, body, ...
)
```

FTS5 的 `MATCH` 只能在**参与索引**的列上命中，`UNINDEXED` 列既不入倒排也不可被 MATCH 检索。于是在生产库里 `MATCH ('note_id : …')` 恒为空集，删除语句**每次都是 0 行受影响**——一条静默失效的删除。

实测（node:sqlite，表内 2 万行）：

| 语句 | 耗时 | changes |
| :--- | ---: | ---: |
| `MATCH('note_id : …')` 删除（现状） | 0.14 ms | **0** |
| `WHERE note_id = ?` 删除 | 6.81 ms | 2（含此前累积的重复行） |
| `MATCH('note_id : …')` 删除（note_id 改为索引列） | 0.35 ms | 2 |

`note_id` 改为索引列后 MATCH 既能命中又保持亚毫秒级；而改回按列扫描则每次删除都是一次全表扫描（2 万行库上做一次完整重建 ≈ 800 页 × 25 条删除，折合数分钟 CPU 与约 4 亿行读，D1 计费与超时都不可接受）。因此修复方向是**让删除的前提成立**，而不是退回扫描。

### 2.2 为什么删除失效会污染结果

`notes_fts` 是普通（contentful）FTS5 表，`note_id` 上没有唯一约束，因此：

- **写入路径**：笔记编辑只入队 `fts_index_queue`（`db/writes.ts`），由搜索或定时任务 drain。drain 的 upsert 分支同样是「先删后插」，删除失效 → 旧行留下 → 旧内容永远可被命中，且每次编辑再加一行。
- **重建路径**：`rebuildFtsIndex` 逐页（25 条）执行「带守卫的删除 + 带守卫的插入」。守卫只保证**不写入陈旧内容**，但删除失效使每一次重建都为同一笔记追加一行 → 重复与陈旧并存，重复数随重建次数增长，与探针观测一致。

守卫本身是正确的：它比对笔记的 `rev/content_hash/title/updated_at`，因此「重建读到旧行 → 编辑先落地」这一交错不会写入陈旧内容。问题只出在删除这一半。

### 2.3 为什么单元测试没有拦住

`tests/fts-index.test.ts` 当时**自带一份手写 schema**，其中 `note_id` 是**索引列**（`note_id,`），与生产的 `note_id UNINDEXED` 不一致：

```sql
-- 测试副本（当时）              -- 生产（FTS_STATEMENT）
CREATE VIRTUAL TABLE … fts5(   CREATE VIRTUAL TABLE … fts5(
  note_id,                       note_id UNINDEXED,
  ...
```

同一句 `MATCH('note_id : …')` 在测试库里能命中、在生产库里恒空，于是「重建不重复」「队列 upsert 覆盖旧行」这些断言在测试里恒绿，线上却失效。这次缺陷的本质是**测试夹具与生产 schema 的漂移**，而不是某一行 SQL 写错。

### 2.4 为什么片段看起来是新的

搜索结果片段由 `contentWindowSql()` 从**笔记当前内容**（`n.content`）截取，而不是从 FTS 行里读；因此陈旧行命中时，片段显示的是编辑后的新文字，只有命中的**关键词**来自旧行——这也是现象容易被误读成「搜索没问题」的原因。

## 三、修复方案

1. **`src/worker/db/schema/statements.ts`**：`FTS_STATEMENT` 的 `note_id` 由 `UNINDEXED` 改为索引列，让依靠 MATCH 的删除真正命中；`user_id` 保持 `UNINDEXED`（读与删都以普通列过滤）。
2. **`src/worker/db/schema/migrations.ts`（version 40）**：`DROP TABLE IF EXISTS notes_fts` 并给每一篇存活笔记入队一条 `upsert`。原因：FTS5 无法 ALTER 列定义，只能重建；而索引体内的文本是**分段处理后**的（CJK 需要在词间插空格，见 `segmentCJK`），这段变换只存在于代码里，因此重建后由队列（而非迁移 SQL）回填。队列未追平期间搜索会回退到 LIKE，答案来自笔记行本身，结果依然正确。
3. **`src/worker/routes/search/helpers.ts`**：用户查询的检索词改为限定列 `{title body} : "…"`。因为 `note_id` 一旦可被 MATCH 命中，未限定列的查询就会用「id 里恰好含这个词」回答用户（实测未限定时 `floorneedle` 这种只存在于 id 的词会返回该笔记）；限定列同时把 id 排除在用户可见结果之外。
4. **`tests/fts-index.test.ts`**：改为从生产的 `SCHEMA_STATEMENTS + FTS_STATEMENT` 构建测试库，杜绝夹具漂移；并补充陈旧内容与重复行用例。
5. **`tests/search-query.test.ts`（新）**：把「id 不得回答用户查询」固化为断言。
6. **`tests/schema-migrations.test.ts`**：新增用例，模拟「旧定义 + 陈旧行」的既有库，断言迁移后索引被重建、存活笔记入队、陈旧行消失。

## 四、验证过程

### 1. 先红

```
tests/fts-index.test.ts  5 failed (5)
  ✗ replaces each note instead of duplicating rows when the index is rebuilt
  ✗ heals an index that already carries duplicate rows for one note
  ✗ drops the previous body when the note changed before the next rebuild reads it
  ✗ replaces the indexed row when the queue carries an upsert
  ✗ drops the indexed row when the queue carries a delete
```

改用生产 schema 后，这 5 例全部因为「删除 0 行」而失败，与探针观测同一根因。

### 2. 变异校验（证明新断言真的会响）

- 把查询词限定的 `{title body} : ` 去掉 → `tests/search-query.test.ts` 两例变红（`expected [ 'floorneedle' ] to deeply equal []`）。
- 把 version 40 的语句清空 → `tests/schema-migrations.test.ts` 新用例变红（`expected [ { note_id: 'n-live' } ] to deeply equal []`，陈旧行存活）。

### 3. 端到端

`scripts/e2e.mjs`（全新本地实例，`INKSTONE_EPHEMERAL_DEV=1 npm run dev:kv`）：

```
✓ reindex cannot overwrite an editor write with a stale FTS row
176 passed, 0 failed
```

同一条断言在修复前（当前基线 `31a26d14` 与缺陷版本 `c3a35ba3`）稳定为 `175 passed, 1 failed`。

### 4. 回归

串行全量单元测试、`typecheck` 与 12 项静态门禁（含 `check-migration-immutability`）均为绿；体积基线因 `migrations.ts` 新增一条迁移按流程重新采样。

## 五、后续如何避免

1. **测试夹具禁止复制 schema**：涉及索引、触发器、虚拟表的断言必须从 `SCHEMA_STATEMENTS` / `FTS_STATEMENT` 构建，禁止手写副本。本次已把 `tests/fts-index.test.ts` 改为引用生产定义——夹具与生产同源，才谈得上「测试通过等于线上通过」。
2. **索引的读写两侧要成对验证**：只测「插入后能查到」不够，必须同时测「旧内容查不到」。本次为重建、队列 upsert、队列 delete 三条路径各补了旧内容消失的断言。
3. **性能优化必须带前提校验**：`MATCH` 依赖列被索引，这类前提属于 schema 契约。改动索引列定义时，同时改「依赖它的查询」与「覆盖它的测试」，并补一条迁移用例。
4. **删除的返回值应当被审视**：删除类语句的 `meta.changes` 是「这次真的动到行了吗」的唯一证据；重建/清理路径可对其做断言，让「静默 0 行」变成显式失败。
5. **门禁分工继续保留**：本次是 `scripts/e2e.mjs` 的行为断言先报红（HTTP 层、跨请求交错），单元测试负责定位与固化根因。浏览器/行为门禁与单元门禁的分工不要合并到一处。
