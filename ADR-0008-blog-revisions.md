# ADR 0008: 博客文章版本历史——保存前快照、恢复即普通写入

Status: Accepted（已实现：`blog_revisions` 表 + 迁移 58，写入路径见 `posts.ts` 与 `revisions.ts`）

Date: 2026-10-01

## Context

文章目前只有「当前状态」：`/posts` 的 upsert、`PATCH /posts/:id`、`/sync` 都是覆盖式写入，改错一次就无法回到上一版；`/sync` 还会拿笔记正文整段盖掉文章正文。笔记侧早有 `note_versions`（`id, note_id, user_id, title, content, size, created_at`，每次编辑插一条、只保留最近 N 条、可列表/读取/恢复），文章侧没有对应物。

对照主流：WordPress 每次更新存一条 revision（标题/正文/摘要/自定义字段），可预览、可恢复；恢复本身也是一次普通更新，所以「恢复」也能被再次恢复。Ghost 的 revisions 语义相近。

约束与既有事实：

- `blog_posts` 的列已经被 FEA-01/02/04 追加过（`published_at` 语义、SEO 五列、`deleted_at`），迁移 52（slug 唯一性重建）不可改。
- 文章地址的「退役/占用」由 `blog_post_slugs` 记账（FEA-03）：改名要同时退役旧地址并占用新地址，新建文章占用旧地址还要清掉重定向。恢复一版里的旧 slug 因此必须走同一套账。
- 作者侧计数、公开可见性都对回收站与定时发布敏感，历史不能把这些状态藏起来。

## Decision

### 一、快照「可被作者改写的内容」，不是整行

`blog_revisions` 的列 = 发布表单与 `/sync` 能改的字段：`slug`、`title`、`excerpt`、`content`、`cover_url`、`category_id`、`folder_id`、`tags`、`is_published`、`allow_comments`、`is_pinned`、五个 SEO 字段，加上 `post_id`、`user_id`、`id`、`created_at`。

刻意**不**进快照：`views`（计数）、`published_at`（发布时刻是时间线，不是文字）、`created_at`/`updated_at`、`deleted_at`。恢复一版文字不应重写这些事实。

### 二、写在保存前拍照；只有能改写文字的写入才拍照

三条写入路径在改写前把**当前行**存成一版：`PATCH /posts/:id`（只要请求带任一内容字段）、`POST /posts` 的 upsert（发布弹窗本来就会重写全部字段）、`POST /posts/:id/sync`（笔记正文整段盖入）。只移动展示状态的 patch（`isPinned`/`isPublished`/`allowComments`/`publishedAt`）不拍照——置顶一次不该把一段正文历史挤出窗口。

### 三、恢复是一次普通写入

恢复把那一版的内容字段写回文章，并在同一个 batch 里先把**恢复前**的状态存成一版：所以恶意或误操作都能再恢复回来。恢复**不**写回展示状态（`is_published`/`allow_comments`/`is_pinned`）与计数器：它们是「今天怎么看这篇文章」的决定，不是某一版文字的一部分。恢复一版的 `slug` 若已被别的文章占用，回 409 而不是静默改名；地址迁移复用 `blog_post_slugs` 的同一对语句（退役当前、占用恢复值）。

### 四、保留策略与删除

每篇文章保留最近 **20** 版（`BLOG_REVISION_LIMIT`），插入与裁剪在同一个 `DB.batch` 里：`created_at DESC, rowid DESC` 即是列表顺序也是裁剪顺序。回收站**保留**历史（还原一篇旧文时它还是同一篇），真正的清除（purge / 清空回收站）会一并删掉该文章的版本行——那正是作者要求「彻底删除」的地方。

### 五、接口与界面

管理路由三条：`GET /posts/:id/revisions`（无正文列表，标题/体积/时间）、`GET /posts/:id/revisions/:revisionId`（整版）、`POST /posts/:id/revisions/:revisionId/restore`。都要求文章属于本账号且**不在回收站**（补丁与同步对回收站文章同样 404）。客户端从文章卡片/行的「更多操作」菜单进入，面板显示无正文列表与逐条恢复，恢复前确认（`blog.revisions_confirm`）。

## Consequences

- 每次内容写入多一个 INSERT + 一个 DELETE（同一 batch），列表多一条索引查询；正文是快照里最大的一列，所以 20 版是「够用」与「不把库当仓库」之间的取舍。历史上限不是分页，超出即丢。
- 恢复会 bump `updated_at`、可能改 `slug`（走 FEA-03 的重定向记账）；恢复后客户端重读 posts / postIndex / stats / tags / 版本列表。
- 历史**不**记录「谁改的」：实例是单作者模型，没有第二个人。
- 版本没有差异视图，也没有「恢复到某一字段」——整版恢复，够用为止。
- 定时发布中的文章可以编辑、可以留历史；`published_at` 不进快照，所以恢复不会把一篇已发布文章变成定时文章。
- 回收站里的历史不可见（列表 404），但仍占保留名额；purge 时随文章一起删。
