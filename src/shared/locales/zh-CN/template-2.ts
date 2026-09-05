export const messages = {
"template.four_quadrant.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [四象限]
---

## 1. 重要且紧急 —— 立即做
- [ ] 

## 2. 重要不紧急 —— 排期做
- [ ] 

## 3. 紧急不重要 —— 委托他人
- [ ] 

## 4. 不紧急不重要 —— 放弃或减少
- [ ] 

> 原则：把时间留给第二象限，真正重要的事都住在这里。{{cursor}}
`,
"template.four_quadrant.description": "按紧急程度与重要程度把任务分成四个象限，先做重要且紧急的事。",
"template.four_quadrant.name": "四象限法则",
"template.gtd.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [gtd]
---

## Inbox 收件箱
- 

## Next Actions 下一步行动
- [ ] 

## Waiting For 等待他人
- [ ] 

## Projects 项目
- [ ] 

## Someday / Maybe 将来也许
- 

## Calendar 日历
- {{today}}：
- {{tomorrow}}：

> 每周回顾：清空收件箱、更新清单，并为每个项目确定下一步的具体行动。
`,
"template.gtd.description": "收集—厘清—整理—回顾—执行，把脑袋里的事清空到清单里。",
"template.gtd.name": "GTD 任务管理",
"template.habit_tracker.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [习惯]
---

## 习惯清单
- [ ] 
- [ ] 
- [ ] 

## 月度打卡

| 日期 | 习惯 1 | 习惯 2 | 习惯 3 |
| --- | --- | --- | --- |
| 1 |  |  |  |
| 2 |  |  |  |
| 3 |  |  |  |

## 复盘
- 漏了一天？别断链，明天继续就好。{{cursor}}
`,
"template.habit_tracker.description": "用一张网格表记录每天的习惯完成情况。",
"template.habit_tracker.name": "习惯打卡",
"template.knowledge_cards.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [卡片笔记]
---

## 核心想法

> 一句话。

## 展开

## 来源
- 

## 关联
- [[相关笔记]]

## 行动
- [ ] 

> 写得像再也不会看到原始来源一样。{{cursor}}
`,
"template.knowledge_cards.description": "一张卡片一个想法，搭建自己的知识库。",
"template.knowledge_cards.name": "知识卡片",
"template.marketing_plan.content": `---
title: {{title}} 营销策划
createdAt: {{createdAt}}
tags: [营销]
---

## 活动概览
- 目标：
- 目标受众：
- 上线日期：

## 渠道
- [ ] 社交媒体
- [ ] 邮件
- [ ] 内容 / SEO
- [ ] 付费广告

## 内容计划
| 日期 | 渠道 | 主题 | 状态 |
| --- | --- | --- | --- |
|  |  |  |  |

## 预算
| 项目 | 计划 | 实际 |
| --- | --- | --- |
| 广告 |  |  |
| 制作 |  |  |

## 成功指标
- 

## 复盘时间
- {{tomorrow}}
`,
"template.marketing_plan.description": "策划一次营销活动：受众、渠道、预算与排期。",
"template.marketing_plan.name": "营销活动策划",
"template.meal_log.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [饮食]
---

## 早餐
- 

## 午餐
- 

## 晚餐
- 

## 加餐
- 

## 每日小结
- 热量：  / 
- 饮水： 杯
- 感受：
- 

> 诚实的记录胜过完美的记录。{{cursor}}
`,
"template.meal_log.description": "记录三餐、热量与餐后感受。",
"template.meal_log.name": "饮食记录",
"template.meeting_minutes.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [会议]
---

## 基本信息
- 时间：
- 参会人：
- 缺席：

## 议程
1. 

## 讨论要点
- 

## 决策
1. 

## 待办事项
- [ ] 负责人：  · 截止：

## 下次会议
- {{tomorrow}}
`,
"template.meeting_minutes.description": "记录会议决策、待办事项与负责人。",
"template.meeting_minutes.name": "会议纪要",
"template.mistake_notebook.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [错题]
---

## 科目

## 原题

## 我的错误

## 正确解法

## 根本原因
- [ ] 粗心
- [ ] 知识点不熟
- [ ] 方法错误

## 重测日期
- {{tomorrow}}
`,
"template.mistake_notebook.description": "记录错题与正确解法，避免重复犯错。",
"template.mistake_notebook.name": "错题本",
"template.morning_pages.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [日记]
---

## 自由书写

想到什么写什么，不修改、不停笔。

{{cursor}}

## 今日一句

## 今日意图
`,
"template.morning_pages.description": "每天早晨写三页自由书写，清空大脑，捕捉灵感。",
"template.morning_pages.name": "晨间日记",
"template.movie_log.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [观影]
---

## 观影清单

### {{date}}
- 片名：
- 评分：⭐⭐⭐
- 短评：
- 最喜欢的场景：

## 想看清单
- [ ] 
- [ ] 

## 年度统计
- 总数：
- 最爱：
`,
"template.movie_log.description": "记录看过的影视作品，打分并写下短评。",
"template.movie_log.name": "观影记录",
"template.okr.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [okr]
---

## 目标一

- [ ] KR 1.1： 
- [ ] KR 1.2： 
- [ ] KR 1.3： 

## 目标二

- [ ] KR 2.1： 
- [ ] KR 2.2： 

## 每周检视
| 周次 | 进展 | 阻碍 |
| --- | --- | --- |
|  |  |  |

> 关键结果要可衡量、有挑战、有期限，每周检视一次。
`,
"template.okr.description": "目标与关键结果，把雄心壮志拆成可衡量的成果。",
"template.okr.name": "OKR 目标管理",
"template.pdca.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [pdca]
---

## Plan 计划
- 目标：
- 现状：
- 根本原因：
- 准备采取的行动：

## Do 执行
- [ ] 
- [ ] 

## Check 检查
- 结果与计划的差距：
- 有效之处：
- 无效之处：

## Act 处理
- 保留：
- 调整：
- 下一轮开始：{{tomorrow}}
`,
"template.pdca.description": "计划—执行—检查—处理的循环，用于持续改进。",
"template.pdca.name": "PDCA 循环",
"template.pomodoro.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [番茄钟]
---

## 今日目标

## 番茄钟记录

| # | 任务 | 打断 | 完成 |
| --- | --- | --- | --- |
| 1 |  |  | [ ] |
| 2 |  |  | [ ] |
| 3 |  |  | [ ] |
| 4 |  |  | [ ] |

## 备注
- 

> 节奏：25 分钟工作、5 分钟休息；每 4 个番茄钟休息长一点。{{cursor}}
`,
"template.pomodoro.description": "25 分钟专注 + 短休息，用番茄钟对抗拖延。",
"template.pomodoro.name": "番茄工作法",
"template.prd.content": `---
title: {{title}} PRD
createdAt: {{createdAt}}
tags: [产品]
---

## 背景
- 问题：
- 为什么是现在：

## 目标
1. 

## 非目标
- 

## 目标用户
- 

## 用户故事
- 作为……，我想要……，以便……

## 功能范围
### 包含
- [ ] 

### 不包含
- 

## 验收标准
- [ ] 

## 衡量指标
- 

## 待确认
- 
`,
"template.prd.description": "产品需求文档：背景、用户、范围与验收标准。",
"template.prd.name": "产品需求文档",
};
