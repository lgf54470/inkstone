export const messages = {
"template.article_outline.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [写作]
---

## 标题

## 核心论点
> 

## 读者

## 大纲
### 1. 开头
- 

### 2. 第一节
- 核心论点：
- 论据：

### 3. 第二节
- 核心论点：
- 论据：

### 4. 结尾
- 

## 参考资料
- 
`,
"template.article_outline.description": "搭建文章结构：论点、章节与关键论据。",
"template.article_outline.name": "文章大纲",
"template.book_notes.content": `---
title: 《{{title}}》读书笔记
createdAt: {{createdAt}}
tags: [读书]
---

## 书目
- 作者：
- 开始阅读：{{date}}
- 读完：

## 核心观点
1. 

## 金句摘录
> 

## 我的想法
- 

## 行动清单
- [ ] 

## 评分
⭐⭐⭐⭐⭐
`,
"template.book_notes.description": "阅读一本书时记录金句、想法与行动清单。",
"template.book_notes.name": "读书笔记",
"template.brainstorm.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [头脑风暴]
---

## 主题

## 规则
- 数量优先于质量
- 过程中不批评
- 在别人的想法上继续延伸

## 原始想法
- 
- 
- 
- 

## 归类
### 类别 A
- 

### 类别 B
- 

## 优选
1. 

## 下一步
- [ ] 
`,
"template.brainstorm.description": "先尽情收集想法，再分类、排序、收敛。",
"template.brainstorm.name": "头脑风暴",
"template.bug_tracker.content": `---
title: Bug：{{title}}
createdAt: {{createdAt}}
tags: [bug]
---

## 严重程度
- [ ] 致命
- [ ] 高
- [ ] 中
- [ ] 低

## 环境
- 版本：
- 系统 / 浏览器：

## 复现步骤
1. 

## 预期行为
- 

## 实际行为
- 

## 根因
- 

## 修复方案
- [ ] 

## 验证
- [ ] 修复前已复现
- [ ] 修复版本：
`,
"template.bug_tracker.description": "一条笔记一个 Bug：复现步骤、根因与修复。",
"template.bug_tracker.name": "Bug 追踪",
"template.bullet_journal.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [子弹头笔记]
---

## 未来日志
- [[月份]] · {{tomorrow}}
- [[月份]] · {{tomorrow}}
- [[月份]] · {{tomorrow}}

## 月度日志

| 日期 | 任务 | 事件 | 备注 |
| --- | --- | --- | --- |
|  |  |  |  |

## 每日日志

- [ ] 任务
- [ ] 迁移的任务 · >
- [ ] 安排的任务 · <
- 事件 · o
- 备注 · -

## 符号说明
- · 任务 · > 迁移 · < 安排 · o 事件 · - 备注
- * 优先 · ! 灵感 · ? 疑问 · x 完成
`,
"template.bullet_journal.description": "用符号快速记录任务、事件与想法，配合未来日志规划长期安排。",
"template.bullet_journal.name": "子弹头笔记",
"template.category.health": "健康与习惯",
"template.category.industry": "行业专用",
"template.category.learning": "学习与知识",
"template.category.life": "生活记录",
"template.category.productivity": "效率方法",
"template.category.tasks": "任务与清单",
"template.category.work": "工作与会议",
"template.category.writing": "写作与创作",
"template.tag.checklist": "清单",
"template.tag.daily": "每日",
"template.tag.finance": "财务",
"template.tag.goal": "目标",
"template.tag.health": "健康",
"template.tag.life": "生活",
"template.tag.review": "复盘",
"template.tag.study": "学习",
"template.tag.table": "表格",
"template.tag.tech": "技术",
"template.tag.travel": "旅行",
"template.tag.weekly": "每周",
"template.tag.work": "工作",
"template.tag.writing": "写作",
"template.class_notes.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [课堂]
---

## 课程
- 讲师：
- 主题：

## 要点
1. 

## 例子
- 

## 疑问
- [ ] 

## 课后
- [ ] 复习笔记
- [ ] 完成练习
- [ ] 请教问题
`,
"template.class_notes.description": "结构化的课堂听课笔记。",
"template.class_notes.name": "课堂笔记",
"template.cornell.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [康奈尔笔记]
---

| 线索栏 | 笔记栏 |
| --- | --- |
| 关键词、问题 | 正文笔记、图示、例子 |

> 左边写关键词和问题，右边记录笔记要点。
> 24 小时内复习：遮住笔记栏，根据线索栏复述内容。

## 总结

用自己的话在 1-3 句话内概括本页内容。{{cursor}}
`,
"template.cornell.description": "经典的「线索栏—笔记栏—总结」布局，适合听课与阅读。",
"template.cornell.name": "康奈尔笔记",
"template.dev_daily.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [开发]
---

## 今日进展
- [ ] 
- [ ] 

## 实现细节
- 

## 提交 / 合并
- 

## 阻塞
- 

## 待确认
- 

## 明日计划
- [ ] 

## 今日收获
- 
`,
"template.dev_daily.description": "程序员每日开发日志：进展、阻塞与下一步。",
"template.dev_daily.name": "开发日志",
"template.diary.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [日记]
---

## 心情
- 精力（1-5）：
- 心情（1-5）：

## 今日亮点
1. 

## 流水账
- 

## 感恩
- 

## 明天
- [ ] 

{{cursor}}
`,
"template.diary.description": "带日期、心情、亮点与感恩的日记页。",
"template.diary.name": "日记",
"template.expense_log.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [记账]
---

## 今日支出
| 项目 | 分类 | 金额 |
| --- | --- | --- |
|  |  |  |

## 分类小计
- 餐饮：
- 交通：
- 购物：
- 其他：

## 预算对照
- 每日预算：
- 今日花费：
- 本月剩余：

## 备注
- 
`,
"template.expense_log.description": "按类别记录每日支出，对照预算复盘。",
"template.expense_log.name": "记账本",
"template.feynman.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [费曼]
---

## 概念

## 白话解释

假装在教一个 8 岁的小孩：

> 

## 发现的知识缺口
1. 

## 简化重试

用一个比喻重新写一遍：

## 最终检查
- [ ] 不用术语能讲清楚吗？
- [ ] 能举出具体例子吗？
`,
"template.feynman.description": "用大白话讲清一个概念，找出自己的知识盲区。",
"template.feynman.name": "费曼学习法",
};
