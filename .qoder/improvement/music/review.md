# 音乐库功能模块审查报告（合并去重版）

> 审查日期：2026-09-18。范围：`src/client/features/music/**`、`src/client/features/music/music-store/**`、`src/worker/routes/music/**`、`src/shared/{types,music-*,locales/*/music}.ts`、`src/client/lib/api/music.ts`、demo 后端 music 路由。约 93 个非测试文件 / 1.2 万行。
> 方法：四路并行审查（UI 规范与交互、性能与状态、安全、功能完整性）+ 主审对最高影响结论逐条读码复核。
> 溯源标记：✅ = 主审已直接读码复核证据行；◐ = 分审代理报告（附 file:line，未逐条独立复核）。
> 严重度统一为 P0（立即修）/ P1（本迭代修）/ P2（排期修）/ P3（打磨/暂缓）。
> 代价：S ≈ ≤半天，M ≈ 1–3 天，L ≈ 一周级，XL ≈ 需专项 + schema/后端设计。

## 总览结论

1. **底层工程扎实，表层接线失职。** 自研 ID3v2.2/2.3/2.4 + FLAC Vorbis + MP4 atom 解析、Range 只读标签字节、服务端跨设备续播、WebDAV 凭据走 Credential Vault 加密、SQL 全参数化 + 逐条 user_id 隔离——这些都对得起规范。但 29 个已备好却零引用的文案键暴露了一批「设计了没接上」的死控件、假表单、不可用导出。
2. **一条可落地的账户接管链（SEC-1）**：WebDAV 流透传上游 `Content-Type` + CSP nonce 中间件给任何 `text/html` 响应内联脚本盖章，两个单点各自「还行」，叠加即同源任意 JS。必须同批修。
3. **性能模型有三处结构性问题**：每行曲目复制一份全库派生计算（PERF-1）、播放心跳写全局 store（PERF-2）、一切以整库为单位读写（PERF-3）。三者互相放大，1000 首量级在「边播边搜」时可感知掉帧（估计 300–500 行开始可见，需实测）。
4. **UI 有一对幽灵令牌**（`--accent-subtle` 被 21 个文件引用、`--sp-12` 均未定义），且现有 `tokens:check` 只校验定义端，抓不到「使用未定义 var」——选中态背景实际透明。
5. **music 是全仓唯一零自动化覆盖的业务域**：无组件测试、不在 `e2e.mjs` / `e2e-visual.mjs` / `check-contrast.mjs` / bundle budget / surface coverage 名单内。上述多数问题本应被最低限度断言拦住。

---

## 一、安全（SEC）

### SEC-1 【P0】WebDAV 流透传上游 Content-Type × CSP nonce 盖章 = 同源任意 JS → 账户接管 ✅◐

- 证据：
  - `src/worker/routes/music/stream.ts:74`：`'Content-Type': upstream.headers.get('Content-Type') ?? row.mime`（✅ 已复核）
  - `src/worker/app.ts:197-208`：`applyScriptNonce` 对任何 `text/html` 响应里所有无 `src` 无 `nonce` 的 `<script>` 一律盖本次响应的合法 nonce（✅ 已复核）；`app.ts:67-70` 登录用户开 `preview.externalImages` 时 `img-src` 追加 `https:`（✅）。
- 攻击路径：用户接入任意第三方 WebDAV（本功能卖点）→ 服务器对音频路径回 `text/html` + `<script>` → Worker 原样以本应用源返回 → 受害者顶层导航 `/api/music/tracks/:id/stream` 得到一份带合法 nonce 的同源文档 → `script-src` 失效，以受害者身份调用全部写接口（改备份目标、删笔记、开公开开关）→ 账户接管。`lookup.ts:25-26` 封面代理反射上游 `content-type` 是同一类问题（◐）。
- 方案：① `stream.ts` WebDAV 分支只用 `row.mime`，最终 `Content-Type` 过 `keys.ts` 格式允许列表，非白名单降级 `application/octet-stream` + `Content-Disposition: attachment`；② nonce 盖章限定已知 HTML 文档路由（`/`、`/s/*`、`/authorize`），`/api/*` 拒绝 `text/html`；③ `lookup.ts` 响应类型限 `png/jpeg/webp`。
- 范围：`stream.ts`、`app.ts`（全局中间件，建议单独 ADR）、`lookup.ts`。代价：S–M。**两条必须同批修，只修其一仍可利用。**

### SEC-2 【P1】`coverUrl` PATCH 零格式校验 → 封面端点代理读取任意 `music/cover/` 对象（BOLA）✅

- 证据：`schemas.ts:13` `coverUrl: z.string().max(2048).nullable().optional()`（✅，对比 `keys.ts:71-78` 的 `sanitizeCoverUrl` 只在 `upload.ts:113` 用）；`rows.ts:80` 把 `music/cover/` 前缀值换成代理 URL；`cover.ts:23-26` 直接当 R2/KV key 读。
- 攻击：`PATCH` 自己曲目 `{"coverUrl":"music/cover/<day>/<他人trackId>.jpg"}` → 经自己曲目的 `/cover` 读出他人封面字节。key 含 128 位随机 id 不可盲枚举，但 `public.ts:100-112` 公开投影同时泄漏 `id` 与 `createdAt`，已发布 owner 的对象 key 可离线构造。
- 方案：PATCH 路径改走 `sanitizeCoverUrl`（仅 `https?://` 或图片 data URL），显式拒绝 `MUSIC_OBJECT_PREFIX` 开头；服务端存储 key 只允许由本 trackId 派生。范围：`schemas.ts`、`tracks.ts`。代价：S。

### SEC-3 【P1】删除路径信任用户可写 `object_key`，前缀检查代替归属检查 → 可删他人 R2/KV 对象 ✅◐

- 证据：`webdav-routes.ts:70` `object_key: body.path`（✅，`importMusicSchema` 仅禁 `..` 段，`schemas.ts:93-96` ✅）；`tracks.ts:109` `keys.filter(isMusicObjectKey)` 仅前缀判定（◐）。
- 攻击：导入时提交 `path: "music/<day>/<victim>.mp3"` 形态的字符串落库，删除该曲目时触发 `env.FILES.delete(任意 music/ 键)` → 跨租户破坏。WebDAV 源轨道本就不该触碰 R2 删除。
- 方案：删 R2 对象须同时满足 `row.source === 'r2'` 且 key 由行数据重算（`musicObjectKey(...row.id...)`）；`importMusicSchema.path` 禁止以 `music/` 开头并加字符白名单。范围：`webdav-routes.ts`、`tracks.ts`、`schemas.ts`。代价：S。

### SEC-4 【P1】「公开音乐库」是实例级全局 meta，任何 member 可开关/抢主 ✅

- 证据：`settings.ts:8-9` 全局 key `music_public_enabled`/`music_public_owner`；`:27-33` 仅 `requireAuth`，无角色判定，禁用时不清 owner（✅ 全文件已读）。对照仓库约定 `routes/settings.ts:25`、`mcp-settings.ts:79` 均要求 `role === 'owner'`。
- 攻击：开放注册实例（`auth.ts:138-139` 首用户 owner 其后 member）中，任一 member `PUT {enabled:true}` 即把公开投影指向自己（静默下线他人），或 `{enabled:false}` 拒绝他人服务。`public.ts:58/63` 的 `max-age=600/86400` 使取消发布后边缘缓存仍存活最长 24h。
- 方案：加 `role === 'owner'` 判定（或按 `userId` 分键支持多 owner）；关闭时删 owner key；公开投影加可失效版本段。代价：S–M。

### SEC-5 【P1】`GET /api/music/webdav` 带 MKCOL 写副作用且 GET 免检客户端头 → 顶层导航型 CSRF ◐

- 证据：`webdav-routes.ts:18,45` GET 先 `ensureMusicDir` → `backup/webdav.ts:113-117` 发 `MKCOL`；`middleware/auth.ts:138-143` `requireClientHeader` 只对非 GET 生效，cookie `SameSite=Lax` 允许顶层 GET 带 cookie。
- 方案：`ensureMusicDir` 移出只读浏览路径（改显式 POST 或仅写入时确保）；GET 浏览 `no-store`。代价：S。

### SEC-6 【P1】cover-lookup 出站请求无主机白名单、无重定向管控、无限速 ◐

- 证据：`lookup.ts:21` 直接 `fetch(artworkUrl)`（默认跟随重定向，未过 `isAllowedOutboundUrl`）；`music-cover-match.ts:11-27` 未校验 iTunes 响应里的 URL scheme/host。二阶 SSRF（`http://169.254.169.254`、重定向换源）+ Content-Type 反射（并入 SEC-1）。
- 方案：`isAllowedOutboundUrl` + `*.apple.com` 白名单 + `redirect:'manual'` + 按 `music-lookup:<userId>` 预算。代价：S。

### SEC-7 【P1】除上传外，音乐侧昂贵/写端点全部无速率限制 ◐

- 证据：唯一预算在 `upload.ts:162-178`（200/h）；`webdav-routes.ts` import/upload/delete（每次对第三方发多请求并缓冲 64MB）、`tracks.ts:58` play、`playback.ts:41`、batch、`settings.ts:27`、`lookup.ts:16` 均无限流。单用户脚本可把用户自己的 WebDAV 打挂（应用沦为放大源）、打满 D1 写配额。
- 方案：把 `backup.ts` 的 `OUTBOUND_BUDGETS` 模式抽成共享工具，给 `music-webdav:*`、`music-play:*`、`music-write:*`、`music-lookup:*` 设具名预算；CI 门禁要求新增出站端点必须声明预算。代价：M。

### SEC-8 【P2】上传整体缓冲 + 配额 TOCTOU + 节流顺序 ◐

- `upload.ts:45` 64MB 全进 isolate（并发即 OOM 风险）；`upload.ts:154-160` 先 SUM 再写的配额可被并发穿透；`upload.ts:33` 节流在体积校验前，可被用来「一次 429 锁人」。方案：R2 走 `put(key, stream)`（需实测 Hono `formData()` 流式可用性）、配额事务式收口、节流后置。代价：M。

### SEC-9 【P2】第三方声明的 mime/size 无条件采信 ✅◐

- `webdav-routes.ts:71`（✅ 片段已读：`stat.mime.startsWith('audio/')` 即采信任意子类型）；`stream.ts:83`（✅）用存储的 `size_bytes` 填 `Content-Length`，与实际正文不符时缓存污染/流挂起。方案：mime 过格式允许列表；`Content-Length` 只在 R2 分支设置。代价：S。

### SEC-10 【P2】客户端 FLAC/MP4 解析越界抛异常且调用点未捕获（违反铁律 2）◐

- `music-flac.ts:51-56` 0 长度 PICTURE 块即 `RangeError`；`music-mp4.ts:50-51` `mvhd size=8` 越界；`library-tracks.ts:17` 与 `music-hub-toolbar.tsx:149` 均无 catch → 恶意/畸形 WebDAV 字节让扫描静默中断。方案：解析器长度不足返回 `null`（同 `music-cover.ts:57` 的既有姿势），调用点补 catch + toast。代价：S。

### SEC-11~14 【P3】

- **SEC-11** `webdav-xml.ts:23` `String.fromCodePoint` 对 `&#99999999999;` 抛 RangeError → 整个 browse 500。一行修复 + `parseMultistatus` try 兜底。代价：S。◐
- **SEC-12** `rows.ts:63` 把内部 `objectKey` 下发前端并写进 M3U 导出（与 FEAT-4 同根）；`rows.ts:79` 允许 `http://` 封面外链（混合内容 + 向第三方泄漏访问者 IP）。方案：类型不暴露 objectKey，封面统一 `sanitizeCoverUrl`。代价：S。◐
- **SEC-13** SSRF 防护停留在字面 hostname（`outbound-url.ts:12-41`），DNS rebinding 在 Cloudflare 边缘不可达内网、但本地/自托管 workerd 可达——需人工确认部署形态声明；若支持自托管需解析后 IP 二次判定。代价：M。◐
- **SEC-14** demo 后端 `music.ts:39,57` 采信 `file.type` 并回显（攻击者=用户本人，仅记录，防复制粘贴到真实路由）。代价：S。◐

### 安全面核对通过项（无需修改）

34 条路由除 `public.ts` 三条有意公开外全部 `requireAuth`；全部查询带 `user_id`（含 IN 批量分支）；SQL 全 prepared + 白名单列名；WebDAV 密码入 Credential Vault 加密、从不回传、不入日志；路径遍历三重收口（`joinRelative` + `normalizeMusicDir` + 逐段 encode）；id/对象 key 不可枚举；前端无 `dangerouslySetInnerHTML`，React 文本渲染 + `nosniff` + `Range` 边界处理正确；客户端存储无 token/密码。

---

## 二、UI 规范与交互（UI）

### UI-1 【P0】正在播放面板收藏/置顶是死按钮 ✅

- `music-now-playing.tsx:107-112` 两个 `IconButton` 无 `onClick`（✅ 已复核，相邻 Tags 按钮 :113 有）。点击零反馈。
- 方案：接 `toggleFavorite`/`togglePin`（store action 与后端 PATCH 都在，纯漏接线）。代价：S。

### UI-2 【P0】歌单描述收了就丢——静默数据丢失 ✅◐

- `music-playlist-modal.tsx:30-36` 采集 `description`，保存路径只发 `{ name }`（`library-collections.ts:83`）；`api/music.ts:100` 与后端 schema 均支持 description。用户填完关窗内容凭空消失。
- 方案：透传 description（新建 + 重命名 + 编辑态渲染回填），或删掉 Textarea。代价：S。

### UI-3 【P0】沉浸式播放器无任何可见关闭入口、对话框无可访问名 ✅

- `Modal` 头部/关闭按钮仅在传 `title` 时渲染（`components/overlay/modal.tsx:44` ✅）；`music-immersive-player.tsx:41`（✅）不传 `title`/`ariaLabel` → 画面上只有 Esc/遮罩可退，读屏器拿到通用 `overlay.dialog`。`music-hub-modal.tsx` 同样未传 `ariaLabel`，自绘 `<h2>` 未与 dialog 关联。未引用键 `music.exit_immersive` 是原意图证据。
- 方案：传 `ariaLabel` 并在自绘头部放关闭 `IconButton`；两处 modal 补可访问名。代价：S。

### UI-4 【P0】加载失败态无重试且直吐技术字符串 ◐

- `music-hub-modal.tsx:106-107` `description={loadError}` 把 `fetch failed` 甚至字面量 `'error'` 给用户，`Empty` 支持 `action` 却不给；未引用键 `music.retry`。
- 方案：action 接 `loadLibrary()` + `music.retry`；原始 error 只进 console。代价：S。

### UI-5 【P1】幽灵令牌 `--accent-subtle`：选中态背景实际透明 ✅

- `tokens.css` 只有 `--accent-soft/-softer/-ring/-muted`，**无 `--accent-subtle`**（✅ grep 0 定义），但 21 个文件引用（✅ 计数复核），含 music 的 sidebar/playlists/source-badge/edit-modal/transfer-dialog。结果：当前曲库范围、来源徽标、选中歌单在两套主题下都没有底色，状态只剩字重+文字色（同时踩「不得仅靠颜色传达」）。**全仓性问题，不止 music**（`components/hub-tag-item.tsx`、`share/*`、`blog/*`）。
- 方案：统一替换 `--accent-soft`；给 `check-token-drift.mjs` 加反向校验（收集所有 `var(--x)` 使用点与定义集求差，非空即失败）——现有 `tokens:check`/`hardcoded:check` 都抓不到这类错误。范围：21 文件 + 1 脚本。代价：S（替换）+ M（门禁）。

### UI-6 【P1】幽灵令牌 `--sp-12`：行高预留失效 ✅

- `tokens.css:46-47` 间距从 `--sp-10:40px` 跳到 `--sp-16:64px`（✅），`music-track-row.tsx:14`（✅）`containIntrinsicSize: 'auto var(--sp-12)'` 拿无效值 → 离屏行不预留高度，长列表滚动条跳动/锚点漂移。
- 方案：改 `'auto 48px'` 或补 `--sp-12: 48px` 令牌（后者需更新漂移基线）。代价：S。

### UI-7 【P1】触屏设备整片不可用：hover/focus 才显形的控件 ◐

- `music-track-row.tsx:210/219`、`music-track-card.tsx:58`、`music-queue-list.tsx:65` `opacity-0 group-hover:...:opacity-100`——触屏无 hover，行菜单/收藏/队列移除在移动端等于不存在；且 `opacity-0` 未配 `pointer-events-none`，透明按钮反向拦截行点击。同仓 `music-hub-tags.tsx:134` 已有正确范式（默认可见，`md:` 起降级）。
- 方案：照 hub-tags 姿势改三处。代价：S。

### UI-8 【P1】队列重复曲目索引错位 + key 重复 ✅

- `music-queue-list.tsx:31`（✅）`index: queue.indexOf(id)` 对重复入队曲目恒返回首个下标 → 播放/移除操作错行；`key={id}-${index}` 随之重复，React 复用错节点。另 `indexOf` 在 map 内 O(Q²)（并入 PERF-21）。
- 方案：`selected.map((id, index) => ...)`；根治是入队时生成条目 uid。代价：S。

### UI-9 【P1】列表 ARIA 结构非法：`role=grid` 行内只有一个 gridcell ◐

- `music-track-row.tsx:83-96,131` 序号/封面/标题/操作列全是裸 span/button，读屏表导航崩坏；表头 `columnheader`（`music-track-table.tsx:76-97`）无交互无 `aria-sort`；窄→宽切换来源列错位。
- 方案：要么补齐 `table`+`aria-sort` 全列，要么降级 `list/listitem`。与 UI-18（表头排序）、FEAT-9（艺人列）合并做。代价：M。

### UI-10 【P1】空搜索结果误报「库是空的，去上传」 ◐

- `music-track-list.tsx:52` 有查询词时仍用 `no_tracks_hint`，无「清除搜索」出口；未引用键 `music.no_results`。方案：`hasQuery` 分支 + action 清 query。代价：S。

### UI-11 【P1】WebDAV 浏览失败渲染成「空目录」 ◐

- `music-webdav-modal.tsx:51-53,118-119` 列举失败时 `entries` 为空 → 显示 `webdav_empty`，真实错误只在未配置分支；未引用键 `music.webdav_failed`。方案：先判 `webdav.error` → 错误态 + 重试。代价：S。

### UI-12 【P1】浮动播放器拖拽把手：`span role=button` + 误导文案（铁律 10）◐

- `music-floating-player.tsx:136` `aria-label` 用 `music.drag_to_reorder`（「拖拽调整顺序」），实际是移动窗口；无 Enter/Space/Esc 语义。方案：换 `IconButton` + 新键 `music.move_player`，`music-drag.ts` 补键盘模式切换与 Esc。与 FEAT 报告的 B-11 同条。代价：S–M。

### UI-13 【P1】可滚动容器键盘不可达 ◐

- 歌词容器（`music-now-playing.tsx:49`、`music-immersive-player.tsx:51`）、WebDAV 列表（`music-webdav-modal.tsx:121`）、传输列表（`music-transfer-dialog.tsx:134`）缺 `tabIndex={0}`。代价：S。

### UI-14 【P1】窄屏布局需实测：三栏 `shrink-0` 可能挤没中央列表 ✅（M-46 已修）

- `music-hub-modal.tsx:40` `min-h-145`（≈580px）小视口撑破；sidebar `w-56`/now-playing `w-64`/immersive `w-96` 均 `shrink-0`，<700px 时中央列表被压向 0。浮动播放器 bottom 偏移与状态栏重叠需 375px 实测。方案：`max-[900px]` 断点折叠左右栏为 Drawer。代价：M。
- 落地：共享断点 `MUSIC_NARROW_BREAKPOINT=900`（music-utils.ts）；hub 窄态左右栏折叠为 header 开启的 Drawer（Z_INDEX.menu 盖过模态）、去 `min-h-145`；沉浸式窄态改堆叠（封面行横排于歌词之上）。浮动播放器避让状态栏一项已由 M-45 单独修复。375px 实测由 e2e-visual 4 条新断言转正：未折叠变异下行宽 16px、歌词面板 246px，均被断言拒绝。

### UI-15 【P1】歌单排序链路全就绪、零 UI 调用；且置顶永远覆盖播单顺序 ✅◐

- `api/music.ts:118 reorderPlaylist` 与 `playlists.ts:101-114` 路由齐全，全仓无调用方（feature 与 UI 两路独立 grep 确认）；`library-load.ts:141` 所有 scope 统一置顶优先，播单手动顺序被抹平。方案：playlist scope 按 items 顺序短路排序 + 接拖拽/上下移菜单项（键盘等价）。代价：M。

### UI-16~24 【P2】（各条含证据，方案均为局部改动，代价 S–M）

- **UI-16** 视图切换/来源筛选手写 `role=radiogroup`（`music-track-list.tsx:110-128`、`music-hub-toolbar.tsx:39-60`）绕开现成 `Segmented`：无 roving tabindex、无方向键、组名误用选项文案。→ 换 `Segmented`。◐
- **UI-17** 睡眠倒计时每秒变更落在 `role=status aria-live=polite`（`music-transport-widgets.tsx:222-227`）→ 读屏每秒轰炸。→ `role=timer aria-live=off`，仅开/关播报。◐
- **UI-18** 破坏性确认不一致：单曲删除（`music-track-menu.tsx:77-82`）、歌单删除（`music-hub-playlists.tsx:52`）、清空队列直删，而批量删除/远端删除有 `confirm()`；`delete_track_confirm`/`delete_playlist_confirm` 两键未引用。→ 统一 `confirm({tone:'danger'})`，歌单文案注明「不删音频」。**真删 R2 对象无确认，属合规缺口。**✅（feature 路复核）
- **UI-19** 音量控件双实现（`music-player-controls.tsx:102-126` vs 复用中的 `MusicVolumeSlider`）→ 组合复用。◐
- **UI-20** 裸 `<img>` 绕过 `MusicArtwork` onError 兜底（`music-player-controls.tsx:66-68`、`music-now-playing.tsx:62-64`）→ 统一组件。◐
- **UI-21** `music-popover.tsx` 伪装 dialog：触发器无 `aria-expanded/haspopup`，面板项键盘不可达（倍速/睡眠/队列/音量四处使用）→ 迁移 `Menu` 或补漫游焦点。◐
- **UI-22** 搜索历史面板缺 combobox 语义（`music-hub-toolbar.tsx:172-201`）→ `role=listbox` + 方向键或改 `Menu`。◐
- **UI-23** `--scrim` 上叠 `--text-inverse` 的时长角标（`music-track-card.tsx:36/39` 等 3 处）对比度存疑且 10px 字——未被任何门禁覆盖，需实测；建议专用 overlay-badge 令牌并把 music 纳入 `check-contrast.mjs`。✅（M-44c 实测坐实：inverse/scrim 两套主题 1.77/1.01，三处角标与封面浮层改 `--text-primary`，check-contrast 已纳入 music 三个表面并判此项）
- **UI-24** 上传反馈缺口：`dismissUpload` 只是隐藏行、上传继续（用户以为取消）；只校验 `size>0` 不校验类型；逐文件 toast 不聚合（`library-collections.ts:169-171,223-225`）。→ 真 `cancelUpload`（AbortController）+ 扩展名过滤 + 汇总 toast。与 PERF-8/FEAT-3 同根。◐

### UI-25~29 【P3】

- **UI-25** `♪` 进可访问名、缺 `aria-current`；冗余原生 `title`（`music-queue-list.tsx:58`、`music-status-bar.tsx:50`）；`music-hub-tags.tsx:116` 裸 `<input>` 且借 notes 域键。代价：S。◐
- **UI-26** 进度条无缓冲显示（`audio-engine` 已暴露 buffered 事件未用）；沉浸式无音量滑块。代价：S–M。◐
- **UI-27** 双击复位/双击静音隐藏手势、`120` 魔法数（`music-floating-player.tsx:99`）。代价：S。◐
- **UI-28** `as never` 断言（`selectors.ts:18,28`）、`pane` 死属性、占位 lambda 误读。代价：S。◐
- **UI-29** 格式化不统一：`formatTotalDuration` 硬编码英文单位、模块内重复 `formatBytes`、`toLocaleDateString()` 用浏览器 locale 而非应用 locale（`music-utils.ts:19-33`、`music-now-playing.tsx:102`）。→ `Intl` + 复用 `lib/time.ts`。代价：S。◐
- **UI-30** 桌面浮动播放器停靠位压住状态栏右端（UI-14 预告的子项，由 M-44b 视觉门禁实测复现）：`md:bottom-4`=16px < `--statusbar-h`=26px，卡片与折叠徽标盖住状态栏底部约 10px；播放会话恢复后状态栏换成交替控制行，右端的「展开播放器」按钮正落在被盖区域（既遮显示又拦点击）。修复：两处停靠改 `md:bottom-[calc(var(--statusbar-h)+1rem)]`，视觉门禁断言播放器矩形与状态栏按钮矩形不相交。375px 挤压主项仍留 UI-14/批次⑦。代价：S。✅（M-45 已修，门禁断言守住）
- **UI-31** 曲表 ARIA 违规（M-44c 把 music 表面喂给 check-contrast 的 axe 后实测复现）：`role="table"` 上挂 `aria-multiselectable`（axe aria-allowed-attr），三个纯图标列（封面/收藏/菜单）挂着空的 `columnheader`（axe empty-table-header ×3）；歌词/详情/队列滚动 div 无角色却带 `aria-label`（aria-prohibited-attr）；hub 导航 aside 与外壳 aside 都无名（landmark-unique）。修复：去 multiselectable（选择语义由每行 checkbox 承担）、图标列改无角色占位、三个滚动容器补 `role='group'`、hub aside 新增 `music.hub_sidebar` 命名。回归由 `music-track-table.test.ts` 新增守卫例与两主题 axe 守住。代价：S。✅（M-44c）
- **UI-32** current/active 行 14% 强调软底上的暗文字层级全线不达 AA（M-44c 列表视图表面实测，浅色主题为重灾区）：行内 quaternary 单元格 4.08、tertiary 4.16–4.47（导航计数/歌单计数/R2 徽章），深色队列时长落在 `--bg-overlay` 底上时 tertiary 4.16–4.44。修复：current 行的暗单元格（序号/艺人/专辑/时长/副行）升 `--text-secondary`，active 计数取行自带 `--accent`（accent-on-own-tint 是令牌体系校准过的唯一配对），队列 current 时长取 secondary，R2 徽章文字 secondary。`check-contrast.mjs` 新增 music 列表/网格/沉浸式三表面按 7 强调色 × 两主题判定，永久守住。代价：S。✅（M-44c）

### UI 正面结论

无 `window.alert/confirm/prompt`、无 `!important`、无十六进制硬编码色、z-index 全走 `--z-*`、内联 style 仅运行时动态值、`Modal/Menu/confirm/Empty/Field` 复用到位、en/zh 键 228/228 对齐、源码零中文字面量、`prefers-reduced-motion` 有全局兜底且被歌词滚动正确尊重。

---

## 三、性能与状态（PERF）

### PERF-1 【P0】每行曲目挂一份完整菜单 = 每行一次全库过滤排序 + ~30 个订阅 ✅

- 证据：`music-track-row.tsx:116`（✅）行内挂 `<MusicTrackMenu target={{track}}>`；`music-track-menu.tsx:52-54`（✅）菜单 hooks 无条件执行且含 `useVisibleTracks()`；`selectors.ts:7-21`（✅）`useVisibleTracks` = 9 个原子订阅 + 每行自己的全库 `visibleTracks()` memo（scope→来源过滤→拼音模糊 rank→双排序→`collectTagIds` 不动点循环）。`target={{track}}` 行内字面量使菜单 memo 每行渲染必失效（含 `flattenTags` O(T²)）。
- 触发：1000 首 + 输入 10 字符 ≈ 1 万次整库过滤；任何 store 写入（含 PERF-2 心跳）跑 3 万次 selector。需实测确认帧耗时（估计 300–500 行开始可见）。
- 方案：①菜单改全局单例（store 存 `menuTarget`，hub 根部渲染一份）；②行内删 `useVisibleTracks`；③动作函数走 props 下传或 `useShallow`。范围：track-row/menu/table/list/card。代价：M。

### PERF-2 【P0】播放心跳 `currentTimeMs` 写全局 store ✅

- 证据：`audio-engine.ts:38` `timeupdate → bridge.onTime`；`player.ts:18`（✅）`set({ currentTimeMs })` 每 ~250ms 一次全局写入；9 个订阅点，沉浸式 modal 顶层订阅使整棵子树（歌词表 + 队列列表）每秒重建 4 次。
- 方案：进度下沉为非 React 状态——`audio-engine` 暴露独立 `subscribeProgress`（或 `useSyncExternalStore` 小 store），seek 条/时间文本/歌词高亮各自订阅；主 store 只在 pause/ended/seek/切歌写一次；歌词高亮按 `activeLyricIndex` 变化才更新。代价：M。

### PERF-3 【P0】整库无分页无字段裁剪（歌词随行下发），20+ mutation 后全量重载 ✅◐

- 证据：`library.ts:36` SELECT 含 `lyric`（上限 128KB/首）（◐）；`library-load.ts:11` 一次拉全库（✅）；`library-collections.ts:128,139,154,164`、`library-tracks.ts:105,119`、`music-hub-modal.tsx:31`（每次打开 Hub 无条件 `loadLibrary()`，✅）各自整库重载。
- 方案：①`/library?fields=light` 去 lyric，歌词懒取；②mutation 返回单条本地 merge（`mergeTracks` 已存在）；③`loadLibrary` 加 in-flight 去重 + 60s 新鲜度 + ETag；④后续加游标增量。范围：worker `library.ts` + store 各 mutation。代价：M。

### PERF-4 【P0】KV 部署下每个 Range 请求把整首歌读进 isolate ◐

- 证据：`storage.ts:60-63` `FILES_KV.get(key,'arrayBuffer')` 后 `subarray` 切片；`stream.ts:41` 所有 Range 走此路。用户拖一次进度条 = 拉整文件（≤25MB）再切小段，seek 连环请求。R2 分支（`storage.ts:54` 原生 range）无此问题。
- 方案：KV 分支按 1MB 对齐窗口 + Cache API；或 KV 部署文档声明限制。代价：M。需实测。

### PERF-5~13 【P1】

- **PERF-5** WebDAV 批量导入每首「1 次 import + Range 探测 + PATCH + **整库重载**」串行（`webdav.ts:66-67,79`）→ 本地 append、循环尾一次 reload、并发 4–6。代价：S–M。◐
- **PERF-6** 元数据扫描 256KB 步进循环里对**累积缓冲**重跑封面解码（`createImageBitmap`+canvas+`toDataURL` 同步）与整套 ID3 解析，`concatBytes` 每轮整体复制（6MB tag ≈ 72MB 累计拷贝，`music-metadata.ts:114-123,187`）→ 按 ID3 header 一次取精确长度、末次解码、chunks 单次 alloc、解析搬 Web Worker。代价：M。◐
- **PERF-7** 下载全量缓冲内存峰值 ~3× 体积 + 每 chunk 写 store（`transfers.ts:35,54,96`）→ 流式 Blob / File System Access，进度 200ms 节流。代价：S–M。◐
- **PERF-8** 上传/下载/WebDAV 导入/元数据刷新全部并发=1 严格串行（`library-collections.ts:175-177`、`transfers.ts`、`library-tracks.ts:14`）→ `mapWithConcurrency(items,4,fn)`，解析与 PUT 重叠。代价：S–M。◐
- **PERF-9** 批量刷新元数据/匹配封面：500 首 = 500×(1–3 range + 6–7 条 D1 的 PATCH) 串行、无进度、不可取消、再点叠加（`library-tracks.ts:14-25`、`library-covers.ts`、`music-hub-toolbar.tsx:144-149`）→ 并入 transfers 任务模型 + `POST /tracks/batch-metadata`（D1 batch）。代价：M。◐
- **PERF-10** 可视器 rAF 不随暂停/隐藏停止、`AudioContext` 从不 suspend/close（`music-visualizer.tsx:79-87`、`audio-engine.ts:150-170`），浮动播放器默认挂载 → 后台常驻 60fps + 移动端音频硬件占用。→ `!isPlaying` 停帧、visibility/IntersectionObserver 门控、暂停 5s 后 suspend。代价：S。✅（UI 路同报）
- **PERF-11** 播放位置周期同步条件写错：`hasPlaybackChanged` 拿相邻 250ms 快照比较 4000ms 阈值（`playback-sync.ts:58-61`）→ 只听不切歌时位置几乎不落端（只剩 pagehide 兜底）；而一旦触发，5000 首队列 = 服务端 100 次串行 D1 往返（`playback.ts:57`）。→ 记 `lastSavedPositionMs` 显式量化；服务端单条 IN 查询；队列上限降 200–300 或只存来源指纹。代价：M。◐
- **PERF-12** 搜索无 debounce（`music-hub-toolbar.tsx:86` 每键写 store），首次拉丁输入动态拉 280KB pinyin 块并同步罗马化整库（`library-load.ts:61`）→ debounce 150–250ms + `useDeferredValue` + 分片罗马化 + search index 按库版本缓存。代价：S–M。◐
- **PERF-13** WebDAV 目录 >512KB 直接 500（`readResponseBytesWithinLimit` 抛非 ApiError）、>2000 条静默截断（`webdav-xml.ts:15,37`）→ 超限返回具名 `ApiError(502,'webdav_listing_too_large')` + UI 提示进子目录；`{entries, truncated}` 显式标记。代价：S–M。◐

### PERF-14~24 【P2】

- **PERF-14** 单条 PATCH 6–7 条 D1 且两次重复 `loadTrackRow`（`tracks.ts:41,43`）→ 删重复查询、tag 校验并入 batch。S。◐
- **PERF-15** 歌单加一项 5 条串行语句、重排一项一条 UPDATE（`playlists.ts:140-160`）；客户端逐首 await（`library-collections.ts:137`）→ 路由 `db.batch` + 批量 items 接口。M。◐
- **PERF-16** 列表无真实窗口化，`content-visibility` 只省绘制不省 DOM/hooks/订阅（`music-track-row.tsx:14`）→ 固定行高下 60 行自研 windowing 或 `@tanstack/react-virtual`（加依赖需按铁律 8 评估）。M。◐
- **PERF-17** `handlers` memo 依赖 `selection` → 勾选一行全列表 props 换身份重渲染（`music-track-list.tsx`）→ `selectedSet` 入 store，行内原子订阅。M。◐
- **PERF-18** 队列列表每渲染重建全库 Map + `indexOf` O(Q²) + index 进 key 致删队首全量 remount（`music-queue-list.tsx:29-39` ✅）→ useMemo + 条目 uid。S。
- **PERF-19** `moveSelectionToTag` 无上限并发 PATCH（`library-collections.ts:122`）→ 并发 4–6 或 batch 端点。S。◐
- **PERF-20** 每次打开 Hub 整库重拉且无 in-flight 去重（`music-hub-modal.tsx:31` ✅）——已并入 PERF-3。
- **PERF-21** MediaSession 缺 `setPositionState`/`seekto`（`audio-engine.ts:105-144`）→ 锁屏/车机进度条不可拖。S。◐
- **PERF-22** `readDurationMs` 无超时（`music-probe.ts:10-14`）→ 浏览器不解码不报错的容器让串行上传链永久挂起。`Promise.race` 8s 超时。S。◐
- **PERF-23** 拖拽/进度指针事件直写 React state（`music-drag.ts:43` 60–120Hz、DropZone dragenter 抖动、XHR progress 每事件写 store）→ transform 直写 DOM、commit 才 set、进度聚合节流。S。◐
- **PERF-24** 偏好每次变更同步 `JSON.stringify`+`localStorage.setItem`（`player.ts:194-198`、`state.ts:80-86`）→ 250ms trailing debounce。S。◐

### PERF-25~27 【P3】

- **PERF-25** 音乐代码在首屏关键路径：`index.ts` barrel 静态导出 StatusBar/FloatingPlayer/SessionSync → `music-seek-bar` chunk（53.8KiB）+ `shell`（223.7KiB，含可视器）被 app 静态引入，只有 hub modal（61.7KiB）是懒的；`check-bundle-budget.mjs` 对 music 零预算（✅ 产物与脚本双证）。→ store/engine 懒化 + BUDGETS 加 music 条目。M。
- **PERF-26** 次级未 memo 扫描：`flattenTags` O(T²)（`music-utils.ts:152`）、工具条双遍 filter、`getState()` 渲染期读（`music-immersive-player.tsx:48` ✅ 同 UI/feature 报告）。S。
- **PERF-27** demo 后端每次 Range 整文件读入、organizer reorder O(n²)、cover-lookup 响应 2MB 缓冲且匹配串行。S–M。◐

### 性能面核对通过项

`loading=lazy` + failedUrl 守卫无封面重试风暴；无 `createObjectURL` 泄漏；seek 条拖动只写本地 state 松手 commit（符合预期）；D1 复合索引命中主要查询路径；tagIds 单条 link 查询无 N+1；pinyin 动态 import 未进首屏 chunk；`activeLyricIndex` 二分。

---

## 四、功能完整性（FEAT）

### FEAT-1 【P1】播放失败只会卡死，不会跳过 ◐

- `player.ts:303-314` `reportPlaybackFailure` toast + `pause()`；404/解码失败/断流把整轮播放停住。听歌单中途一首坏文件即永久中断。
- 方案：失败自动跳下一首（连续 N 首失败才停）+ 坏曲标记。M。

### FEAT-2 【P1】「加入队列」静默去重无反馈 ◐

- `player.ts:219-225` 重复入队被无声吞掉；`music.added_to_queue` 文案未引用。S。

### FEAT-3 【P1】上传不支持文件夹、不能取消（signal 已预留未用）◐

- `music-transfer-dialog.tsx:80-90` 无 `webkitdirectory`；`api/music.ts:139` 收 `signal` 但调用处从不传；4 条 `upload_*` 错误文案未引用。M（与 UI-24/PERF-8 同根）。

### FEAT-4 【P1】M3U 导出内容不可播放（写内部 objectKey）✅◐

- `music-export.ts:7` 写 `track.objectKey`（`music/<userId>/<uuid>.mp3`），既非 URL 也非文件名，任何播放器放不出来；`export_done` 文案未引用证明从未端到端跑通。方案：改签名 URL（带 expires）或纯文件名列表；根治靠 SEC-12 不再下发 objectKey。S–M。

### FEAT-5~10 【P2】

- **FEAT-5** mp4/webm 被静默降级为纯音频且无画面（`keys.ts` mp4→m4a；播放器只有 `<img>`）——传 MV 的用户「能播但永远黑屏」。至少明确提示或拒绝。M + 产品决策。◐
- **FEAT-6** 元数据扫描只填空不纠错（`library-tracks.ts:41-51` 注释即策略），标签写错的曲目扫多少次都不变，无「强制覆盖」开关。S–M。◐
- **FEAT-7** 搜索 200 条上限静默截断（`music-search.ts:64`），无「结果过多」提示。S。◐
- **FEAT-8** 无任何播放快捷键：命令面板只有 `mod+shift+m` 打开中枢，空格/←→/上下曲全无绑定；`music.keyboard_hint` 未引用。桌面播放器基本盘。S–M。
- **FEAT-9** 最近播放纯客户端（旧 `state.ts` recentIds 上限 50），换设备即丢；`music_tracks` 无 `last_played_at` 列。加列 + 在已有 `POST /tracks/:id/play` 顺手写时间，成本低价值稳。M。✅（M-47 已修）
  - 落地：迁移 v37 加列+索引，play 路由写 `last_played_at`，rows/library 投影 `lastPlayedAt`；客户端 recentIds 全链路删除，recent scope/侧栏计数改读服务端时间戳；demo 后端对齐。排序下拉「最近添加」维持 createdAt 语义（本次仅改 scope）。
- **FEAT-10** 离线播放明确不可能：`pwa.config.ts:161` 把 `/api/` 划为 network-only，而音频流是 `/api/music/tracks/:id/stream`；「下载」只是存系统目录。飞行模式一首都放不了。若定位为「随身音乐 app」这是分水岭功能：SW Cache Storage + 按曲下载 + 配额回收。L。✅（M-49 已修）
  - 落地：SW 对同源 stream 路由改 network-first + 断网缓存兜底（在线鉴权/Range/过期语义零改动）；页面侧带会话凭证拉 blob 投递 SW（`STORE_OFFLINE_AUDIO`），条目带 size/addedAt 元数据，200MB 预算 FIFO 逐出、单曲超预算先拒绝不损存量；断网 Range 由缓存切 206/416。曲目录制项与选中条批量入口、`offlineTrackIds` 随会话重读；单删/批删同步清除设备副本，登出在清库后清空整个音频缓存（私有内容不跨账号留在共享设备）。
  - 已知限制：SW 仅存在于生产构建（dev/e2e 实例该路径惰性，与既有 PWA 预热同性质）；逐出按保存先后而非最近播放；他端删除的曲目在本端留到同设备删除/登出/预算逐出。

### FEAT-11~18 【P3，按 YAGNI 多数建议暂缓】

- 队列拖拽重排/插入指定位置（M）；专辑/艺人分组视图（L，「像音乐 app」的分水岭，字段已入库后端零改动）；歌单分享/智能歌单/歌单封面（M–L）；重复文件检测（M–L，需 hash 列 + 回填，建议只对新增算）；gapless/crossfade/音量归一化/EQ（M–XL，暂缓）；睡眠「播完当前曲停」（S）；在线歌词搜索（M，可照抄 cover-lookup 代理范式，但需先定版权边界）；整库纳入备份体系（M，误删不可恢复的风险真实但低频）。◐
  - ✅（M-48）队列拖拽重排：moveQueueItem 保持播放行指向、队列变更经 session-sync 持久化；拖放 + 上/下移按钮双入口，过滤态一并收起；「插入指定位置」由既有 addToQueue(next) 承担。
  - ✅（M-48）睡眠「播完当前曲停」：与分钟定时互斥，handleEnded 优先判该旗标（胜过半曲循环），状态行以 role=status 单句呈现。
  - ✅（M-50）专辑/歌手分组视图：纯客户端派生（album/artist 已在库载荷，后端零改动）。侧栏新增两导航项带组计数；网格卡片=封面+名+歌手/曲目数，查询与音源过滤透传；点卡下钻为普通轨道列表（选择/排序/播放/菜单全复用），明细头部带回退、计数时长与 play-all，下钻态父导航保持 aria-current，网格态隐藏无效排序控件。专辑以 歌手+分隔符+专辑 消歧同名专辑，未命名组沉底并本地化标签。
    - 已知限制：网格卡片不虚拟化（组数远小于曲目数，当前规模无感）；e2e-visual 未加真实浏览场景，断言由单测/DOM 测试与变异 M1-M8 覆盖。
  - ✅（M-51）歌单封面 + 歌单分享：封面为客户端派生（playlistCoverUrl 按手动条目顺序取首张有封面曲目，不存字段不设失效）；分享按歌单粒度 opt-in——迁移 v38 给 music_playlists 加 share_slug（NULL=未分享，唯一索引容忍多 NULL），POST/DELETE /playlists/:id/share 幂等发放与吊销，重放链接不换号。公开路由挂 /api/blog/public/music/playlists/:slug*，只认 share_slug、不受整库发布开关约束；stream/cover 以「曲目在该歌单内」的 JOIN 为授权（含 t.user_id=p.user_id 归属保险），投影复用 toPublicTrack 泛化出的路径参数、tagIds 恒空（不外泄标签结构）。匿名页 /playlist/:slug 服务端壳复用 renderShareShell（标题/noindex 走 share 模块公开接口），客户端查看器按 share-page 同构目录自成懒块（music-share-page/ 带 index，app.tsx 在该边界 code-split，音乐初始包不为此增长）：三态（加载/失效 404/失败）、键控 <audio controls autoPlay> 原生控件 + 播完自动下一曲。侧栏歌单行菜单按 shareSlug 出「分享歌单/取消分享」，分享即复制 /playlist/<slug> 链接，剪贴板失败必 toast（沿用 slides copy-link 先例）。demo 后端镜像 share/unshare/public 三路由并锁契约测试。
    - 已知限制：分享链接无过期与访问口令（笔记分享有密码/到期，歌单暂不设，吊销只能整单取消）；无访问量统计；链接随歌单删除而失效；智能歌单不在本项范围（FEAT-11~18 列表仍开放）。
  - ✅（M-52）在线歌词搜索：Worker 代理 lrclib.net（页面 CSP 禁三方连接），路由 GET /tracks/:id/lyric-lookup 先按归属加载曲目（越权即 404 且不触网），再走 'lyric' 小时预算（60/时，独立键不与封面互挤），重定向逐跳复检抽为共享 outbound.ts 供封面/歌词两路复用。匹配优先带时间的 syncedLyrics（LRC 可直接进现有高亮）、退回 plainLyrics，超 128KB 存储上限的匹配按无匹配处理不外泄。路由只读不写：命中经普通 patchTrack 落库，已有歌词的曲目在菜单层弹 confirm 后才替换（拒绝即原样），无匹配走 notice 而非 error。已知限制：结果质量取决于 lrclib 众包覆盖；不缓存上游响应（缓存=落库这一份）；匿名分享页不展示歌词入口；demo 后端不镜像（封面代理同样未镜像）。
  - ✅（M-53a）重复文件检测：迁移 v39 给 music_tracks 加 content_hash TEXT + (user_id, content_hash) 索引（skipIfColumnExists 守卫，只增不改）。哈希只在字节经过 worker 时算——R2 上传与 WebDAV 上传两条路径落 sha256；WebDAV 元数据导入与建列前的旧行恒为 NULL，天然不进重复视图（回填=重新下载整库，不做）。契约字段 contentHash 走 rows.ts 逐字段 toTrack 出载荷；loadTrackRow 与 library 两处窄 SELECT 已补列，否则 PATCH 响应合并会把哈希静默洗掉、曲目从重复视图消失（有专测守住）；toPublicTrack 手工投影不含该字段，匿名不外泄（有断言）。客户端纯函数模块 music-duplicates.ts：按哈希成组（≥2）、组内最旧上传在前（保留的自然那份）、组间按可释放字节降序；新增 'duplicates' scope 走与歌单同样的排序/置顶豁免通道，侧栏导航带冗余计数，列表上方 role=status 汇总条（组数/多出份数/约可释放字节）。批量删除直接复用既有 bulk 删除链路，不新建入口。
    - 已知限制：只覆盖「字节完全相同」的文件（重编码/截断副本不识别）；旧库与 WebDAV 元数据导入曲目无哈希、不参与检测；视图只报告不自动清理。
  - ✅（M-53b）整库纳入备份体系（元数据级）：JSON 导出 bundle（version 仍 1）新增可选 music 段——曲库行（含歌词全文、content_hash、封面与对象键）、音乐标签与链接、歌单与按序条目，五表单批读取；空库不出段，旧导出文件天然兼容。恢复接在 importBundle 尾部（notes/tags 之后），安全判定与在线路径同源：r2 行对象键必须等于本行 id+createdAt 自身推导键（复用删除守卫 isDerivedMusicObjectKey，伪造键不能把恢复变成跨账号存储访问），webdav 行复用抽出的 isWebdavRelativePath 谓词（与导入接口同一判定源，schemas.ts 已改走它）；user_id 服务端绑定，永不取自文件。合并语义「既有为准」：按表载 existing id 只补缺、INSERT OR IGNORE 纵深防御，配额只对 fresh 行求和（重导入不双计）。无效行/重复 id/悬挂标签链接与歌单条目一律计数聚合告警，恶意文件刷不爆告警列表。
    - 已知限制：仅元数据入包，音频字节不随导出（单文件导入上限 64MB、ZIP 展开上限 80MB，均远小于曲库 4GB 配额，字节级不可行——计划既判定）；r2 行恢复后对象可能已被硬删（删除曲目即删对象不可撤回），播放届时 404、行在可重传；封面外链/dataURL 原样存不重验；导入结果无 music 专属计数器，只经 warnings 反馈；demo 后端不镜像（与 M-52 一致）。
  - ✅（M-54a）三段均衡器：音频图升级为 source→lowshelf(180Hz)/peaking(1kHz,Q1)/highshelf(4.5kHz)→analyser→destination，configureEqualizer 存配置并即时重写活图 gain；禁用=全带归零而非拆链——元素 createMediaElementSource 只能接一次，图一旦建成永不重建；play 手势为被 autoplay 封锁的 AudioContext 的重试窗口，EQ 未开启时建图零发生、直出路径不受影响。偏好入 localStorage MusicPreferences（eqEnabled + 三带 ±12dB 整数，readEqDb 单一钳位判定，v2 键不升版）；setEqEnabled/setEqBand 同步引擎并走既有 250ms 防抖持久化，启动时 connectAudio 把已存配置注入引擎。UI 走 MusicEqButton 弹层（Switch + 三组 Slider 组件控件），与倍速按钮同排入主传输、全屏、状态栏（<lg 隐藏）与浮动展开行四处。EQ 增益变化不做响度补偿，归 M-54b。
  - ✅（M-54b）音量归一化（ReplayGain 近似）：图首插入 normGain（EQ 之前），source 另接一路响度 tap（fftSize 2048，取未经 normGain/EQ 染色的元素信号），每 500ms 读时域算 RMS dBFS 并按 audio.volume 反除——测的是文件本身响度而非用户把滑块设到哪，避免归一化反向拽动用户音量；目标 −16dBFS、钳位 ±12dB、dB 域 0.25 平滑逐步逼近，静音（<−60dBFS）、muted、音量 0 三处守卫不动表。play 起轮询、pause 停轮询，构图手势条件扩为「EQ 或归一化任一开启」；关闭即时把 normGainDb 归 0 交还音量控制，图不拆（元素源只能接一次）。偏好 normalizeEnabled 入 MusicPreferences（=== true 逐键校验，v2 键不升版），setNormalizeEnabled 同步引擎 + 开启走手势重试，connectAudio 与初始态从已存偏好注入。UI 在 EQ 弹层底部加分隔线 + 归一化 Switch，复用四处入口不新增按钮；en/zh 加 music.normalize。已知限制：RMS 非 LUFS（无 K 计权/门控，跨流派为近似）、起播需数拍收敛且切曲间隙短暂沿用上一曲增益、AudioContext 放行前走直出无归一化。附带：队列四操作从 player.ts 拆出 queue-ops.ts（本次新增令 player.ts 越过 500 行 size 门禁，按职责拆分）。
  - ✅（M-54c）交叉淡化（gapless 近似）：引擎持有两个交替元素（活动 + 待接），待接元素常驻文档但一切事件经「只在活动元素上生效」的闸门屏蔽，避免它的 timeupdate/play 混进播放桥；每次 50ms、共 3s 的斜坡按**音量守恒**分配（先读 in+out 之和为当前用户音量再按 t 拆），所以用户在淡化中途拖音量条不会被下一帧覆写；交接顺序是「先交换元素引用、后 pause 旧元素」，否则旧元素的 pause 事件会把刚接管的新曲打成暂停态——这条不变量靠 pause 桩真的派发事件才有断言力。新元素接图走每元素一条链（WeakMap 缓存 + 已知链表供重染，交接后 6 个 biquad 一次配平），并手动发布它的 duration（自己的 durationchange 正被闸门挡着）；淡化期间冻结响度修正，交接后在新元素上重启轮询；play() 被拒即自动取消，不留下半个斜坡。store 侧起淡闸门=偏好开关/引擎是否在淡（单一事实源，天然防双起）/非单曲循环/未开「播完停」/有下一曲/时长可读且剩余 ≤3s，完成回调把切换后的曲目采纳进队列并复位进度、发布媒体会话与计数；「播完当前曲停」会先取消在途淡化，否则承诺被一次自动切曲作废。persist 从 player.ts 抽成独立模块以断开 player↔crossfade 的导入环（不是顺手重构：两边都要写偏好，环会让模块初始化顺序不确定）。UI 复用 EQ 弹层加一行 Switch，en/zh 加 music.crossfade；偏好键仍 v2，默认关闭且 `=== true` 严读。已知限制：斜坡期间新元素尚未接图（该段无 EQ/归一化，交接后才染色）；播放计数与队列推进发生在交接时刻而非曲末；近似而非真 gapless（仍是两个解码器重叠 3s，不走 AudioBufferSourceNode 全解码路径）。
  - ✅（M-55a）视频通道（判定/mime/流式一处同源）：`format` 从此只命名容器（决定存储键扩展名与下载文件名），**存的 mime 才是音/视频唯一权威**——worker 侧 resolveMusicTrackType 单点判定：声明的 video/* 压过扩展名（.mp4/.webm 两种轨都装得下），video/x-m4v 归一为 video/mp4（旧值直送 <video> 会被解码器拒），未声明类型的 .mov/.m4v 由扩展表判视频，未带类型的 .mp4 保留历史 audio 读法（→m4a），读不出的视频容器（video/x-msvideo）返回 null 而不是错归档为音频；上传、WebDAV 导入、行读回三处共用它，因此进仓容器、下发 Content-Type 与 UI 下载名不可能再各说各话。内联白名单（safeAudioMime→safeStreamMime）纳入视频 mime，视频改为内联流式而非强制附件下载；删除安全的键派生另立 OBJECT_KEY_FORMAT 表（.mp4 键可删、音频 .mp4 实际存 .m4a 的历史读法不被破坏）。客户端预检 UPLOAD_EXTENSIONS 补 mov/m4v，时长探针按声明类型选 <video> 元素（<audio> 拒绝带视频轨的容器→时长恒 0），两个文件选择器 accept 补 video/*，en/zh 上传文案改说音视频；demo 后端以同一规则集镜像而非放开任意 video/*。
    - 已知限制：M-55b1 前视频曲目仍由 <audio> 元素加载（有声无画；b1 已按 mime 选元素，可见画面见 M-55b2），分享公开页与 EQ/归一化/交叉淡化/可视化/离线缓存只对音频有意义；单曲上限不变（64MB、KV 部署 25MB、配额 4GB），更大的片段走 WebDAV 引用导入（不搬字节）。
    - 过程教训（供后续项复用）：变异首跑用 `--reporter=basic`，vitest 4 已移除该 reporter → 每次调用都退出码 1，13 例「全杀」纯属假象；换 `--reporter=dot` 复跑才暴露 V4 存活，据此删掉与扩展表重复的 VIDEO_EXTENSION_FORMAT 死分支（铁律 5）。同理 e2e-visual/check-contrast 不带参数默认打 :7712（并行会话实例），跑门禁必须显式传本机 BASE。
  - ✅（M-55b1）引擎按 mime 选播放元素：曲目存储里的 mime 是唯一判据（isVideoMime），视频走真正的 `<video controls playsInline>`——原生自带控件既是「有画面就必须能暂停」的最低要求，也免掉了自造控件的键盘/读屏负担；元素仍 hidden 挂在 body，因为可见画面属于 M-55b2 的舞台，而引擎持有的元素必须能在断点重排中活下来（UI 表面会随断点卸载重挂，元素若由 React 持有就会被重建成黑屏）。元素种类从标记属性回读而不是比对引用，换类时旧元素 pause + 清 src + load 交还、其音频图链留在 WeakMap 里等回来；同类型时保留**当前活动元素**而不是查每类一只的表——交叉淡化交接后活动元素已是待接那只，查表会退回被交接掉的元素（这条不变量由 W5 变异守住）。斜坡只混声音、待接元素没有画面槽位，所以任一侧是视频就拒绝淡化，视频走曲末硬切而非中途切换的黑画面。媒体会话三函数拆成 media-session.ts（引擎越过 500 行 size 门禁，按职责拆而非入基线），倍速改由 store 显式传入，锁屏不再反向依赖引擎。
    - 已知限制：画面尚未挂进任何 UI 舞台（b2 已挂入，见下条；出声、无可见画面是当时的状态）；EQ/归一化/可视化技术上能接视频（createMediaElementSource 接受视频元素），但入口与开关仍是音频语境，随 M-55b2 裁决；离线缓存与分享公开页仍按音频。
    - 过程教训（供后续项复用）：`scripts/e2e.mjs` 是初始化型脚本，同一实例只能跑一次——第二次它把实例当已初始化，注册断言全线 403/401 假红；跑链要按 e2e → e2e-visual → check-contrast 一次顺序走完，重来只能换实例。
  - ✅（M-55b2）视频画面挂进播放舞台：引擎持有的元素与「此刻谁该显示画面」分开管——`media-stage.ts` 是一栈，`claimMediaStage(host)` 返回释放函数、栈顶即当前舞台，注册与释放都重放引擎注册的 placer。之所以是栈而不是单个 host：now-playing 面天生嵌套，hub 的左列在沉浸浮层之下仍然挂载，关掉浮层必须把画面**交还给下面那一个**而不是清空（Z1 变异即反转栈序）。视频元素由 `placeOnStage` 上台、离开舞台才 hidden 挂 body，音频元素永不上台（Z4 变异让所有元素都挂过去）；换类退休的旧元素先 append 回 body 再 hidden——它可能还留在某个舞台容器里，容器随组件卸载会把元素一起带出文档，下一个曲目就拿到一只不在文档里的元素（Z6）。画面面按范围裁决只给两处：hub 中心列与沉浸左栏（同一盒子位置上把封面换成 `<MusicVideoStage>`，`isVideoMime(track?.mime)` 才渲染、effect 随声明周期 claim/release）；传输条、浮动播放器、折叠徽标、状态栏仍是封面，因为那些尺寸的画面没有可辨识价值，而它们已经各自带自己的播放控件。铺满与 contain 规则放在新的 `styles/music.css`（app.css 沿用「一个特性一个文件」的既有 import 做法），只认引擎写下的 `[data-inkstone-media='video']` kind 标记，因此不需要 React 给元素加类，也不会与 crossfade 那只尚未接手的 standby 元素混淆。
    - 已知限制：画面在真实浏览器里的铺满/contain 未断言——视觉门禁的曲库探针从不解码字节（「nothing here ever starts audio」），仓库也没有可提交的视频夹具，挂载与交还由单元/组件测试覆盖；分享公开页仍是 `<audio>` 且公开契约 `PublicPlaylistTrack` 不带 mime，视频曲目在该页不可播（M-55b3）；EQ/归一化/可视化对视频技术上可用、本项不改其入口，交叉淡化已拒绝视频；离线缓存仍按音频语义，未对视频字节另立大小策略。
    - 过程教训（供后续项复用）：e2e.mjs 的「只跑一次」这次我自己又踩了一遍——第一次只留了尾巴，为查那一个红名重跑一次得到整片 403/401 假红，此后第一次就重定向全量输出再 grep。`vi.resetModules()`（音频桩）使测试文件**静态** import 的模块与引擎重新 import 的不是同一代，舞台测试必须 `await import('./media-stage')` 才拿到引擎真正用的那一份。`claimMediaStage` 原本带一个 `released` 守卫防释放函数被调两次，变异脚本没人杀它——它防的是不存在的调用方，按铁律 5 连断言一起删。CSS 块注释被 comments 门禁直接拒（策略是一律禁止，仓库所有样式表零注释），理由改写进组件的 TS 注释。
  - ✅（M-55b3）分享公开页按 mime 选播放元素：匿名投影 `toPublicTrack` 以前只给标题/时长/URL，读页拿不到「这条是声音还是有画面」，于是只能猜——猜错的读者会得到一个不出画的黑色方块。契约因此补 `mime`（`/library` 与 `/playlists/:slug` 共用同一序列化器，一处补齐两处生效；demo 后端镜像同字段），分享页的 `NowPlayingBar` 用 `isVideoMime` 在 `<video controls playsInline>` 与 `<audio>` 之间选一个，共享的 src/controls/autoPlay/onEnded 收进一个 props 对象，两种元素走同一条传输语义；key 必须显式写在两个分支上——把它塞进展开的 props 对象里 React 19 会发开发期告警（「A props object containing a "key" prop is being spread into JSX」），而显式化之后两条分支各有一份 key，于是视频分支也补了一条切曲节点同一性断言（此前只有音频分支被那条断言守着，A7b 变异因此存活）。原生控件仍是唯一传输面（无会话的读者不需要一套自造按钮），`key=track.id` 保证切曲是换元素而不是改 src——改 src 会留着上一曲的解码器与缓冲。不泄露边界不变：投影里仍只有 mime/lyric/两个 URL，没有 objectKey、sizeBytes、contentHash。
    - 已知限制：博客前台（`blog-frontend/`，独立 Astro 应用）的 `BlogMusicTrack` 是白名单式 normalize，会把新增的 mime 直接丢掉，且播放器固定 `new Audio()`，所以发布到博客曲库的视频轨在前台仍只有声无画（M-55b4，另一个应用与另一套测试，不在本次夹带）；`src/worker/db/schema/music.ts` 旧库导入的 `COALESCE(mime, 'audio/mpeg')` 属既有迁移（只增不改）且那些行早于视频通道，不是视频盲区；分享页视频元素的 `max-h-60` 铺满效果未在真实浏览器断言（门禁从不解码字节）；离线缓存与可视化对视频字节的语义仍未裁决。
    - 过程教训（供后续项复用）：两次 e2e 的断言总数可以不同——`scripts/e2e.mjs:665` 那条并发写断言包在 `if (edit.status === 200)` 里，竞态时序决定它跑不跑，本轮因此是 174/1 而不是基线的 175/1；判定办法是 diff 两次 run 的 ✓ 名单看少了哪一条，而不是怀疑自己改坏了。另一条更该记住的：变异脚本**还没跑**的时候不要在任何地方写它的结果——本次差点按上一项的形状叙述了 10 例的通过情况，实跑前所有数字都不存在。

### 功能面核对通过项

4 种播放模式、6 档倍速、睡眠定时、跨设备续播（5s 节流 + pagehide）、播放计数、队列搜索/移除、shift 范围选、标签树作用域、拼音模糊搜索、批量收藏/置顶/删除/下载、R2 真删回收、WebDAV 浏览→勾选导入（可带歌词）→上传、ID3/FLAC/MP4 全格式自研解析 + Range 只读、iTunes 封面批量匹配、LRC 多时间戳 + 二分高亮、流式 20s 起播看门狗、WebDAV 401/404/502 映射、MediaSession 4 action、真字节进度传输中心。

---

## 五、修复路线图（按批次）

| 批次 | 内容 | 条目 | 代价合计 |
| --- | --- | --- | --- |
| **① 安全补丁（下一个版本内，必须同批）** | Content-Type 白名单 + nonce 盖章限定路由 + coverUrl 校验 + object_key 归属化 + public-settings 收 owner 角色 + GET 去写副作用 | SEC-1~6 | S–M |
| **② 死控件/静默丢失速修（纯前端接线）** | 收藏置顶按钮、歌单描述、关闭入口、失败重试、幽灵令牌×2、队列索引、触屏 opacity 控件、删除确认统一、aria-label 把手、加入队列反馈、M3U 导出 | UI-1~12、UI-18、FEAT-2、FEAT-4 | ~2–3 天 |
| **③ 性能结构三件套** | 单例菜单、进度出 store、library 瘦身 + 增量 merge（含 KV Range 方案） | PERF-1~4 | ~1 周 |
| **④ IO 模型与批量任务** | 并发 4–6 + transfers 任务模型 + debounce/DeferredValue + WebDAV 截断显式化 + 元数据解析进 Worker | PERF-5~13、PERF-22~23、UI-24、FEAT-3 | ~1 周 |
| **⑤ 能力兑现（后端就绪只差 UI）** | 歌单排序、表头排序+升降序+艺人列、播放失败自动跳、元数据强制覆盖、播放快捷键、MediaSession positionState | UI-15、UI-9、FEAT-1、FEAT-6、FEAT-8、PERF-21 | ~1 周 |
| **⑥ 门禁补位（防回归网）** | music 单测×3 + e2e-visual 基线（含 375px/reduced-motion）+ 纳入 check-contrast + token 反向校验 + bundle budget music 条目 + 出站预算门禁 | UI-5、UI-27、PERF-25、SEC-7 | ~3–4 天 |
| **⑦ 产品分水岭（需先做产品决策）** | 离线播放、专辑/艺人分组视图、最近播放服务端化 | FEAT-10、FEAT-9、分组视图 | L，各开专项 |
| **暂缓（YAGNI）** | EQ、ReplayGain、真 gapless、重复检测、智能歌单、视频播放 | FEAT-11~18 多数 | — |

## 六、限制声明

- 本报告为静态读码审查：未运行应用、未做 1000 首库压测（PERF-1/2/3 的帧耗时为推算，标「需实测」）；UI-14 窄屏破相、UI-23 角标对比度需真机/截图复核；SEC-3 的完整利用链前提（可控 WebDAV stat 返回 + 删除分支行为）依据 `tracks.ts:109` 前缀过滤读码得出，建议补一条集成测试实证。
- 四路分审结论已交叉印证（如「29 个未引用文案键」由功能路与 UI 路各自独立比对得出；「reorderPlaylist 零调用」由两路独立 grep 确认）；主审对全部 P0 与最高影响 P1 直接复核了证据行（✅ 标记），其余保留代理结论 + 行号供按图索骥。
