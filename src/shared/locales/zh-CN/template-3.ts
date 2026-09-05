export const messages = {
"template.project_review.content": `---
title: {{title}} 复盘
createdAt: {{createdAt}}
tags: [复盘]
---

## 背景
- 项目：
- 周期：
- 目标：

## 做得好
1. 

## 做得不好
1. 

## 根因分析
- 

## 继续做
- 

## 下次改进
- [ ] 

## 经验沉淀
- 
`,
"template.project_review.description": "回顾项目中的得失，沉淀改进项。",
"template.project_review.name": "项目复盘",
"template.recipe.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [食谱]
---

## 菜品

## 份量

## 时间
- 备菜： 分钟
- 烹饪： 分钟

## 食材
- 

## 步骤
1. 

## 口味记录
- 评分：⭐⭐⭐
- 下次调整：

> 记得写下实际使用的调料用量。{{cursor}}
`,
"template.recipe.description": "标准食谱卡片：食材、步骤与口味记录。",
"template.recipe.name": "食谱",
"template.shopping_list.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [购物]
---

## 生鲜食品
- [ ] 
- [ ] 

## 日用品
- [ ] 
- [ ] 

## 数码及其他
- [ ] 

## 预算
- 计划： 
- 已花： 
- 剩余： 

> 每放进购物车一件，就勾掉一件。{{cursor}}
`,
"template.shopping_list.description": "按分类整理的购物清单，带数量与预算。",
"template.shopping_list.name": "购物清单",
"template.sleep_diary.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [睡眠]
---

## 昨夜
- 上床时间：
- 入睡时间：
- 醒来时间：
- 起床时间：

## 质量
- 总睡眠： 小时
- 质量（1-5）：
- 醒来次数：

## 影响因素
- 14 点后摄入咖啡因：
- 睡前使用屏幕：
- 今日运动：

## 今晚计划
- [ ] 开始放松：
- [ ] 熄灯：

> 保持规律作息，周末也一样。{{cursor}}
`,
"template.sleep_diary.description": "记录入睡、起床时间与睡眠质量。",
"template.sleep_diary.name": "睡眠日记",
"template.speech_draft.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [演讲]
---

## 场合
- 活动：
- 时长： 分钟
- 听众：

## 一句话信息
> 

## 开场
- 钩子：
- 为什么讲这个话题：

## 主体
### 要点 1
- 

### 要点 2
- 

### 要点 3
- 

## 收尾
- 回顾：
- 行动号召：

## 演讲提示
- 语速：
- 停顿：
`,
"template.speech_draft.description": "组织演讲稿：开场、要点与行动号召。",
"template.speech_draft.name": "演讲稿",
"template.story_setting.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [写作]
---

## 一句话梗概
> 

## 角色
### 主角
- 姓名：
- 想要：
- 需要：
- 缺陷：

### 反派
- 姓名：
- 想要：

## 世界观
- 背景：
- 规则：
- 冲突来源：

## 情节
### 开端
- 

### 发展
- 

### 结局
- 

## 主题
- 
`,
"template.story_setting.description": "搭建故事的角色、世界观与情节。",
"template.story_setting.name": "故事设定",
"template.swot.content": `---
title: {{title}} SWOT
createdAt: {{createdAt}}
tags: [swot]
---

|  | 积极 | 消极 |
| --- | --- | --- |
| 内部 | **优势 Strengths** | **劣势 Weaknesses** |
|  |  |  |
| 外部 | **机会 Opportunities** | **威胁 Threats** |
|  |  |  |

## 策略
- SO（用优势抓住机会）：
- WO（补短板抓住机会）：
- ST（用优势化解威胁）：
- WT（避开威胁、减少劣势）：
`,
"template.swot.description": "评估优势、劣势、机会与威胁。",
"template.swot.name": "SWOT 分析",
"template.task_breakdown.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [拆解]
---

## 大任务

**目标 / 完成标准：**

## 子任务
- [ ] 1. 
  - [ ] 细节
- [ ] 2. 
  - [ ] 细节
- [ ] 3. 

## 依赖与风险
- 

## 预估
- 总计： 小时
- 截止： 

> 每个子任务都要小到可以不用思考就开始。{{cursor}}
`,
"template.task_breakdown.description": "把大任务拆成一个个可以立刻执行的小任务。",
"template.task_breakdown.name": "任务拆解",
"template.todo_list.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [待办]
---

## 今日待办
- [ ] **高优先级**
  - [ ] 
- [ ] **中优先级**
  - [ ] 
- [ ] **低优先级**
  - [ ] 

## 延后处理
- [ ] 

> 先圈出最重要的一件事，从它开始。{{cursor}}
`,
"template.todo_list.description": "简单清晰的每日待办清单，带优先级与截止时间。",
"template.todo_list.name": "Todo 清单",
"template.travel_guide.content": `---
title: {{title}} 旅行攻略
createdAt: {{createdAt}}
tags: [旅行]
---

## 行程概览
- 目的地：
- 日期：
- 同行人：

## 行程安排
### 第 1 天 · {{today}}
- [ ] 上午：
- [ ] 下午：
- [ ] 晚上：

### 第 2 天 · {{tomorrow}}
- [ ] 上午：
- [ ] 下午：
- [ ] 晚上：

## 预算
| 项目 | 计划 | 实际 |
| --- | --- | --- |
| 交通 |  |  |
| 住宿 |  |  |
| 餐饮 |  |  |
| 门票 |  |  |

## 行李清单
- [ ] 证件
- [ ] 

## 预订
- [ ] 机票 / 车票
- [ ] 酒店
- [ ] 

## 备注
- 
`,
"template.travel_guide.description": "规划行程、预算、行李与预订。",
"template.travel_guide.name": "旅游攻略",
"template.weekly_plan.content": `---
title: {{title}} · 本周
createdAt: {{createdAt}}
tags: [周计划]
---

## 本周重点
1. 

## 日程
| 星期 | 任务 | 备注 |
| --- | --- | --- |
| 周一 |  |  |
| 周二 |  |  |
| 周三 |  |  |
| 周四 |  |  |
| 周五 |  |  |
| 周六 |  |  |
| 周日 |  |  |

## 下周预告
- 

> 周日复盘：哪些推进了，哪些需要重新安排。{{cursor}}
`,
"template.weekly_plan.description": "一周计划：定目标、排日程、周末复盘。",
"template.weekly_plan.name": "周计划",
"template.weekly_report.content": `---
title: {{title}} 周报
createdAt: {{createdAt}}
tags: [周报]
---

## 本周完成
1. 

## 进行中
- 

## 需要支持
- 

## 本周收获
- 

## 下周计划
- [ ] 

## 数据
| 指标 | 目标 | 实际 |
| --- | --- | --- |
|  |  |  |
`,
"template.weekly_report.description": "总结本周进展、收获与下周计划。",
"template.weekly_report.name": "周报",
};
