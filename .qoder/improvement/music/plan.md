# 音乐库模块改进执行计划（music improvement plan）

> 依据：`review.md`（四路并行审查合并台账，SEC/UI/PERF/FEAT 编号）。分支：`music-improvement-qoder-qwen38f`（自 `dev` 53824e3c）。
> 约定：每个条目 = 一个原子提交；顺序执行；每项先写能失败的复现测试，修复后跑回归（typecheck + 相关单测 + 受影响门禁 + pre-commit 全量静态门禁）再提交，提交后更新本文件状态与进度日志。
> 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash）
> review 条目编号见 `.qoder/improvement/music/review.md`。

## 基线

- [x] BASE-0 创建 worktree + `node_modules`/`blog-frontend/node_modules` 软链 + 复制 review.md + 登记本计划
- [x] BASE-1 基线门禁全绿确认（typecheck / 全量 test:unit）

## 第一批 · 安全（SEC-1~14，路线图①）

- [x] M-01 SEC-1a `stream.ts` WebDAV 分支 Content-Type 只用 `row.mime` 并过格式允许列表，非白名单降级 `application/octet-stream` + attachment
- [x] M-02 SEC-1b `app.ts` nonce 盖章限定已知 HTML 文档路由（`/`、`/s/*`、`/authorize`），`/api/*` 的 `text/html` 响应拒绝盖章并强制降级；`lookup.ts` 响应类型限 png/jpeg/webp
- [x] M-03 SEC-2 `patchTrackSchema.coverUrl` 改走 `sanitizeCoverUrl`，显式拒绝 `MUSIC_OBJECT_PREFIX` 前缀
- [x] M-04 SEC-3 删除 R2 对象按行重算 key（`source==='r2'` 且派生匹配）；`importMusicSchema.path` 禁 `music/` 开头、绝对路径与控制字符（保留 Unicode 文件名）
- [x] M-05 SEC-4 `public-settings` 加 `role==='owner'` 判定，关闭时清 owner key
- [ ] M-06 SEC-5 `GET /api/music/webdav` 移出 `ensureMusicDir` 写副作用（改显式 POST/写入时确保）
- [ ] M-07 SEC-6 cover-lookup 出站 `isAllowedOutboundUrl` + `*.apple.com` 白名单 + `redirect:'manual'`
- [ ] M-08 SEC-7 抽共享出站/写预算工具，`music-webdav:*`、`music-play:*`、`music-write:*`、`music-lookup:*` 设具名限额
- [ ] M-09 SEC-9 导入 mime 过允许列表；`Content-Length` 仅 R2 分支设置
- [ ] M-10 SEC-10 `music-flac.ts`/`music-mp4.ts` 越界返回 null；`scanTrackMetadata`/工具栏调用点补 catch + toast
- [ ] M-11 SEC-11 `webdav-xml.ts` 实体解码 RangeError 防护 + parse 兜底
- [ ] M-12 SEC-12+FEAT-4 `MusicTrack` 不再下发 `objectKey`（服务端下发 format/extension）；M3U 导出改文件名/签名 URL；封面 `http://` 走 sanitize

## 第二批 · 死控件与静默丢失（UI/FEAT P0-P1，路线图②）

- [ ] M-13 UI-1 正在播放面板收藏/置顶按钮接线 `toggleFavorite`/`togglePin`
- [ ] M-14 UI-2 歌单描述透传落库（新建+重命名+编辑态回填），store 与 API 同步
- [ ] M-15 UI-3 沉浸式播放器与 Hub modal 补可见关闭入口与 `ariaLabel`
- [ ] M-16 UI-4 加载失败态：`music.retry` 重试按钮 + 技术字符串不外泄
- [ ] M-17 UI-5/UI-6 幽灵令牌 `--accent-subtle`→`--accent-soft`（全仓 21 文件）+ `--sp-12` 修复
- [ ] M-18 UI-7 触屏不可达的 hover-only 控件三处改 hub-tags 姿势（默认可见 + md: 降级 + pointer-events）
- [ ] M-19 UI-8+PERF-18 队列 `indexOf` 索引错位修复 + byId useMemo + key 稳定化
- [ ] M-20 UI-18+FEAT-2 单曲/歌单删除统一 `confirm(tone:'danger')`；加入队列 toast 反馈
- [ ] M-21 UI-12 浮动播放器把手 `span role=button` 改 `IconButton` + 正确 `aria-label`（键盘移动模式另项）

## 第三批 · 性能结构三件套（PERF-1~4，路线图③）

- [ ] M-22 PERF-1 曲目菜单全局单例化（store `menuTarget`），行内删 `useVisibleTracks` 与重复订阅
- [ ] M-23 PERF-2 播放心跳出全局 store（独立 progress 订阅源），歌词高亮按 index 变化更新
- [ ] M-24 PERF-3 `/library` 去 lyric 字段 + mutation 单条 merge + loadLibrary in-flight 去重/新鲜度
- [ ] M-25 PERF-4 KV 分支 Range 请求窗口对齐（或文档化限制 + 禁尾部 range）

## 第四批 · IO 模型与批量任务（PERF-5~13/22~24，路线图④）

- [ ] M-26 PERF-8+PERF-5 `mapWithConcurrency` 工具；WebDAV 批量导入本地 append、尾一次 reload、并发 4–6
- [ ] M-27 PERF-12 搜索 debounce + `useDeferredValue`；罗马化分片
- [ ] M-28 PERF-9+PERF-14+PERF-15 批量元数据/封面并入 transfers 任务模型；PATCH 去重复查询；歌单路由 db.batch
- [ ] M-29 PERF-10 可视器 rAF 随暂停/隐藏停帧；AudioContext suspend/resume
- [ ] M-30 PERF-11 playback-sync 量化条件修复 + 服务端队列保存去串行往返
- [ ] M-31 PERF-13 WebDAV 目录超限具名错误 + truncated 显式标记
- [ ] M-32 PERF-6+PERF-7 元数据解析精确长度一次取 + Worker 化评估；下载流式 Blob + 进度节流
- [ ] M-33 PERF-21~24 MediaSession positionState/seekto；probe 超时；指针事件直写 DOM；prefs 落盘 debounce

## 第五批 · 能力兑现（后端就绪只差 UI，路线图⑤）

- [ ] M-34 UI-15 歌单拖拽/上下移接 `reorderPlaylist`；playlist scope 按 items 顺序短路排序
- [ ] M-35 UI-9 表头点击排序 + `aria-sort` + 升降序 + 艺人列（含 grid ARIA 结构整改）
- [ ] M-36 FEAT-1 播放失败自动跳下一首 + 连续失败熔断
- [ ] M-37 FEAT-6 元数据扫描「强制覆盖」开关
- [ ] M-38 FEAT-8 播放快捷键（空格/←→/上下曲）+ 命令面板条目
- [ ] M-39 UI-10/UI-11 空搜索结果与 WebDAV 失败态文案/出口接线
- [ ] M-40 FEAT-3+UI-24 上传：文件夹支持 + AbortController 真取消 + 类型预检 + 聚合反馈
- [ ] M-41 UI-16~22 剩余 a11y：Segmented 替换手写 radiogroup、timer aria-live、滚动容器 tabIndex、popover→Menu 语义

## 第六批 · 门禁补位（路线图⑥）

- [ ] M-42 token 反向校验门禁（使用未定义 var 即失败）
- [ ] M-43 bundle budget 增 music chunk 条目；music barrel 静态引入链懒化评估
- [ ] M-44 music 纳入 e2e-visual / check-contrast / surfaces 覆盖（含 375px 与 reduced-motion）

## 暂缓（需产品决策，见 review 路线图⑦）

- 离线播放（FEAT-10）、专辑/艺人分组视图、最近播放服务端化（FEAT-9）、EQ/ReplayGain/gapless/重复检测/视频/歌词搜索/歌单分享

## 进度日志

| 日期 | 条目 | commit | 回归结果 |
| --- | --- | --- | --- |
| 2026-09-18 | BASE-0/BASE-1 worktree+计划登记 | be5e08cd | typecheck ✅，全量 test:unit exit 0 ✅ |
| 2026-09-18 | M-01 流端点 Content-Type 白名单（SEC-1a） | 1700b4e3 | 新增 2 例先红后绿（text/html 回显证实），music 3 套件 27 ✅，pre-commit 全部门禁+增量测试 ✅ |
| 2026-09-18 | M-02b cover-lookup 响应类型白名单（SEC-1c） | 85f7eb4f | 新增 1 例先红后绿（上游 text/html 回显证实→500 拒绝），music-routes 16 ✅，typecheck ✅ |
| 2026-09-18 | M-02 nonce 盖章限定非 /api（SEC-1b） | 3053d51b | 新增 tests/security-headers.test.ts 3 ✅（/api 不盖章、/s 与 / 盖章一致）；中间件抽至 src/worker/middleware/security-headers.ts；全量 test:unit 207 文件 1645 ✅，typecheck/comments ✅ |
| 2026-09-18 | M-03 PATCH coverUrl 走 sanitizeCoverUrl 白名单（SEC-2） | b5e7f15f | 新增 2 例先红后绿（内部 music/cover key 被接受并代理证实→null+404；https 保留且省略字段不清空），music 2 套件 27 ✅，typecheck/comments ✅ |
| 2026-09-18 | M-04 删除按行派生 key + 导入路径命名空间隔离（SEC-3） | c372c1f1 | 新增 2 例先红后绿（伪造 victim key 被删证实→不删；music/ 前缀导入 201 证实→400），music 3 套件 32 ✅，typecheck/comments ✅ |
| 2026-09-18 | M-05 public-settings 限 owner 且关闭清 key（SEC-4） | 本次提交（hash 由下一次提交回填） | 新增 1 例先红后绿（member PUT 曾 200 证实→403；关闭后 owner meta 为空），music 3 套件 33 ✅，typecheck/comments ✅ |
