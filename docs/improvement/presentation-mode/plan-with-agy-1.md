# 全笔记演示模式整改执行计划 (Antigravity · 2026-09-30)

> 依据：`docs/improvement/presentation-mode/review-with-agy-1.md`（完整审查报告，28 项问题诊断与方案对标）。  
> 基线 Commit：`39a3814a9123a636acf7bb8f56f2df8c2406e054`  
> 分支：`improvement/presentation-mode-agy`  
> 约定：
> 1. 每个条目 = 一个原子提交；
> 2. 严格遵守 `AGENTS.md` 规范（Conventional Commits + 逐文件说明改动到方法/组件级）；
> 3. 每个提交均运行回归检查（类型检查、单元测试、静态检查门禁）；
> 4. **每一次提交 git 都要实时更新本文件**（更新进度勾选、commit 短哈希、执行日志）；
> 5. 状态图例：`[ ]` 待办 · `[~]` 进行中 · `[x]` 已提交（附 commit short hash） · `[-]` 已证伪 / 已跳过。

---

## 进度总览

| 批次 | 领域 | 覆盖问题项 | 状态 |
| :--- | :--- | :--- | :--- |
| **批次 0** | 文档基线 | 审查报告与整改计划初始化 | `[x]` 已提交 |
| **批次 1** | 核心架构、安全守卫与 A11y 红线 (P0/P1) | P-01, P-02, P-03, P-06, P-07, P-08 | `[ ]` 进行中 |
| **批次 2** | 演说交互体验与视觉信息强化 (P1) | P-04, P-05, P-09, P-10, P-11 | `[ ]` 待处理 |
| **批次 3** | 导航效率、合规收尾与编辑联动 (P2) | P-12, P-13, P-14, P-15, P-16, P-17, P-22 | `[ ]` 待处理 |
| **批次 4** | 深度性能治理与高级演说能力 (P2/P3) | P-18, P-19, P-20, P-21, P-23, P-24, P-25, P-26, P-27, P-28 | `[ ]` 待处理 |

---

## 批次 0 · 文档基线

- [x] **B0-DOC**: 建立 `review-with-agy-1.md`（全量问题深度诊断、涉及文件与函数、修复代码设计）与 `plan-with-agy-1.md`（执行跟踪计划） — 已提交

---

## 批次 1 · 核心架构、安全守卫与 A11y 红线

- [x] **B1-01** `P-01 (SEC-01)`: 全局快捷键表单输入守卫（`F/S/L` 忽略 `onControl` 修复） — 已完成
  - 涉及文件：`src/client/features/presentation/presentation-keys.ts` (`presentationCommand`)、`src/client/features/presentation/presentation-keys.test.ts`
  - 目标：当焦点位于 input / textarea / editable 等控件时，不拦截 `F/S/L`。
  - 验证：单元测试新增用例覆盖 `onControl: true` 下 `f/F/s/S/l/L` 均返回 `null`，既有导航用例全绿。
- [x] **B1-02** `P-02 (UX-05)`: Escape 键退出层级优化（全屏放映时优先退出全屏，窗口态才关闭演说） — 已完成
  - 涉及文件：`src/client/features/presentation/presentation-state.ts` (`escapeAction`)、`src/client/features/presentation/presentation-state.test.ts`、`src/client/features/presentation/presentation-overlay.tsx` (`useDialogBehavior`)
  - 目标：放映时按 Esc 优先退至窗口态，再次按 Esc 退出模式，避免误关演说。
  - 验证：单元测试覆盖全屏返回 exitFullscreen、窗口返回 close，overlay 行为正确衔接。
- [x] **B1-03** `P-03 (PERF-01)`: 舞台设计画幅固定为 `1280x720`，彻底解耦侧栏尺寸与缓存死锁 — 已完成
  - 涉及文件：`src/client/features/presentation/slide-stage.ts` (`measureStage`)、`src/client/features/presentation/slide-stage.test.ts`、`scripts/check-comments.mjs`
  - 目标：将设计画幅固定为 1280x720，容器缩放使用 CSS scale，开合侧栏不再改变设计宽高，100% 杜绝预热缓存失效。
  - 验证：新增 `slide-stage.test.ts` 验证在不同分辨率与侧栏开合时设计画幅与内容区稳定为 1280x720 / 1168x632。
- [x] **B1-04** `P-06 (SPEC-05)`: Follow/Freeze 图标与激活态语义纠偏 — 已完成
  - 涉及文件：`src/client/features/presentation/presentation-controls.tsx` (`PresentationControls`)
  - 目标：跟随中高亮脉冲 `<Radio />`；冻结后不高亮显示 `<Snowflake />`。
  - 验证：纠偏状态图标渲染逻辑，跟随态显示广播电波，冻结态显示冰冻雪花。
- [x] **B1-05** `P-07 (SPEC-03)`: 控制条自动隐藏时移出 Tab 键顺序（`inert` 与 `invisible` 修复） — 已完成
  - 涉及文件：`src/client/features/presentation/presentation-controls.tsx` (`PresentationControls`)
  - 目标：`chromeHidden` 为 true 时增加 `inert` 和 `invisible`，杜绝键盘焦点盲跳。
  - 验证：自动隐藏时节点赋予 inert 属性并切换 visibility: hidden，键盘焦点与辅助树不再穿透。
- [ ] **B1-06** `P-08 (SPEC-02)`: 自动分排子页微标纳入读屏实时播报区域（`aria-live='polite'`）
  - 涉及文件：`src/client/features/presentation/presentation-controls.tsx` (`SlideStepper`)
  - 目标：视障用户在子页间翻动时能感知到页码变化。

---

## 批次 2 · 演说交互体验与视觉信息强化

- [ ] **B2-01** `P-04 (UX-04)`: 舞台左右半区分区点击翻页与触摸手势识别
  - 涉及文件：`src/client/features/presentation/presentation-overlay.tsx` (`PresentationStage`)
  - 目标：支持屏幕左 35% 后退、右 65% 前进与触摸轻扫。
- [ ] **B2-02** `P-05 (UX-01/02)`: 底部细线进度条常驻（解耦 `chromeHidden`）与舞台微型角落页码指示
  - 涉及文件：`src/client/features/presentation/presentation-controls.tsx` (`SlideProgress`)、`src/client/features/presentation/presentation-overlay.tsx`
  - 目标：屏幕底部进度条环境常驻，舞台角落显示无侵入式微型页码。
- [ ] **B2-03** `P-09 (SEC-02)`: 幻灯片超链接安全拦截代理（外链新标签页打开，双链防跳顶）
  - 涉及文件：`src/client/features/presentation/slide-canvas.tsx`
  - 目标：拦截幻灯片内 `<a>` 标签，保护演讲主舞台不跳出。
- [ ] **B2-04** `P-10 (FEAT-05)`: 黑屏 (B) 与白屏 (W) 口头互动控制
  - 涉及文件：`src/client/features/presentation/presentation-keys.ts`、`src/client/features/presentation/presentation-overlay.tsx`、`src/client/features/presentation/use-presentation-keys.ts`
  - 目标：按 `B` 切换纯黑全屏遮罩，按 `W` 切换纯白全屏遮罩，按任意键复原。
- [ ] **B2-05** `P-11 (UX-03)`: 导出按钮安全收敛与防误触隔离
  - 涉及文件：`src/client/features/presentation/presentation-controls.tsx`
  - 目标：高危导出功能与核心全屏/退出控件做物理视觉隔离。

---

## 批次 3 · 导航效率、合规收尾与编辑联动

- [ ] **B3-01** `P-12 (UX-06)`: 侧栏缩略图补充大纲标题文字标签
  - 涉及文件：`src/client/features/presentation/slide-rail.tsx` (`SlideRailItem`)
  - 目标：长篇演说支持文字大纲快速扫视定位。
- [ ] **B3-02** `P-13 (UX-07)`: 侧栏获焦时左右方向键隔离
  - 涉及文件：`src/client/features/presentation/presentation-keys.ts`
  - 目标：焦点在侧栏时左右键不穿透导致舞台焦点脱节。
- [ ] **B3-03** `P-14 (SPEC-01)`: 统一替换裸 Tailwind 阶梯尺寸为设计令牌（AGENTS.md 铁律 4/12）
  - 涉及文件：`src/client/features/presentation/presentation-controls.tsx`
  - 目标：全面采用 `var(--sp-*)`。
- [ ] **B3-04** `P-15 (SPEC-04)`: 侧栏补充标准 ARIA 集合语义声明
  - 涉及文件：`src/client/features/presentation/slide-rail.tsx`
  - 目标：为侧栏导航声明标准 `tablist`/`tab` 集合语义。
- [ ] **B3-05** `P-16 (SPEC-06)`: Canvas/JS 层接入系统减弱动画偏好（`prefers-reduced-motion`）
  - 涉及文件：`src/client/features/presentation/slide-canvas.tsx`
  - 目标：减弱动画偏好开启时，Chart.js 采用 `instant: true`。
- [ ] **B3-06** `P-17 (FEAT-07)`: 光标就近启动演示（根据编辑器当前位置定位 Slide）
  - 涉及文件：`src/client/features/presentation/slides.ts`、`src/client/store/presentation.ts`、`src/client/features/workspace/workspace/use-workspace.ts`
  - 目标：长文编辑无需从第 0 页翻起。
- [ ] **B3-07** `P-22 (SEC-04)`: 命令面板注册“启动演示模式”命令
  - 涉及文件：`src/client/features/command/command-palette/use-commands.tsx`
  - 目标：`Cmd+K` 支持快速呼出演示模式。

---

## 批次 4 · 深度性能治理与高级演说能力

- [ ] **B4-01** `P-18 (PERF-02)`: 单 Slide 内容哈希增量缓存（避免跟随模式协同全篇重算）
- [ ] **B4-02** `P-19 (PERF-03)`: 侧栏单例 Observer 与细粒度事件订阅
- [ ] **B4-03** `P-20 (PERF-04)`: 导出图片流式分批与进度提示
- [ ] **B4-04** `P-21 (SEC-03)`: 嵌套 Bento-Slides 优雅占位降级
- [ ] **B4-05** `P-23 (FEAT-01)`: 智能标题识别切分长笔记（H1/H2 分页）
- [ ] **B4-06** `P-24 (FEAT-03)`: 演讲私有备注语法支持 (`<!-- note: ... -->`)
- [ ] **B4-07** `P-25 (FEAT-04)`: 虚拟激光笔与聚光灯 (L)
- [ ] **B4-08** `P-26 (FEAT-06)`: 全局幻灯片全览网格矩阵 (Overview Grid)
- [ ] **B4-09** `P-27 (FEAT-08)`: 封面居中与双栏排版模板
- [ ] **B4-10** `P-28 (FEAT-02)`: 独立双屏演讲者模式 (Presenter View)
