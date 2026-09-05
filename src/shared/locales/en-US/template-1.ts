export const messages = {
"template.article_outline.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [writing]
---

## Working Title

## Thesis
> 

## Audience

## Outline
### 1. Hook
- 

### 2. Section 1
- Key argument:
- Evidence:

### 3. Section 2
- Key argument:
- Evidence:

### 4. Conclusion
- 

## Sources
- 
`,
"template.article_outline.description": "Structure an article: thesis, sections and key arguments.",
"template.article_outline.name": "Article Outline",
"template.book_notes.content": `---
title: Book Notes: {{title}}
createdAt: {{createdAt}}
tags: [reading]
---

## Book Info
- Author:
- Started: {{date}}
- Finished:

## Key Ideas
1. 

## Quotes
> 

## My Thoughts
- 

## Action Items
- [ ] 

## Rating
⭐⭐⭐⭐⭐
`,
"template.book_notes.description": "Capture quotes, ideas and takeaways while reading a book.",
"template.book_notes.name": "Book Notes",
"template.brainstorm.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [brainstorm]
---

## Topic

## Rules
- Quantity over quality
- No criticism during the session
- Build on each other's ideas

## Raw Ideas
- 
- 
- 
- 

## Clusters
### Cluster A
- 

### Cluster B
- 

## Top Picks
1. 

## Next Step
- [ ] 
`,
"template.brainstorm.description": "Capture raw ideas first, then cluster and prioritize.",
"template.brainstorm.name": "Brainstorm",
"template.bug_tracker.content": `---
title: Bug: {{title}}
createdAt: {{createdAt}}
tags: [bug]
---

## Severity
- [ ] Critical
- [ ] High
- [ ] Medium
- [ ] Low

## Environment
- Version:
- OS / Browser:

## Repro Steps
1. 

## Expected
- 

## Actual
- 

## Root Cause
- 

## Fix
- [ ] 

## Verification
- [ ] Reproduced before fix
- [ ] Fixed in:
`,
"template.bug_tracker.description": "Document one bug per note: repro steps, cause and fix.",
"template.bug_tracker.name": "Bug Tracker",
"template.bullet_journal.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [bullet-journal]
---

## Future Log
- [[Month]] · {{tomorrow}}
- [[Month]] · {{tomorrow}}
- [[Month]] · {{tomorrow}}

## Monthly Log

| Date | Tasks | Events | Notes |
| --- | --- | --- | --- |
|  |  |  |  |

## Daily Log

- [ ] Task
- [ ] Migrated task · >
- [ ] Scheduled task · <
- Event · o
- Note · -

## Key
- · task · > migrated · < scheduled · o event · - note
- * priority · ! inspiration · ? question · x done
`,
"template.bullet_journal.description": "Rapid logging with bullets, tasks, events and notes plus a future log.",
"template.bullet_journal.name": "Bullet Journal",
"template.category.health": "Health & Habits",
"template.category.industry": "By Industry",
"template.category.learning": "Learning & Knowledge",
"template.category.life": "Life & Leisure",
"template.category.productivity": "Productivity",
"template.category.tasks": "Tasks & Lists",
"template.category.work": "Work & Meetings",
"template.category.writing": "Writing & Creation",
"template.tag.checklist": "Checklist",
"template.tag.daily": "Daily",
"template.tag.finance": "Finance",
"template.tag.goal": "Goals",
"template.tag.health": "Health",
"template.tag.life": "Life",
"template.tag.review": "Review",
"template.tag.study": "Learning",
"template.tag.table": "Table",
"template.tag.tech": "Tech",
"template.tag.travel": "Travel",
"template.tag.weekly": "Weekly",
"template.tag.work": "Work",
"template.tag.writing": "Writing",
"template.class_notes.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [class]
---

## Course
- Lecturer:
- Topic:

## Key Points
1. 

## Examples
- 

## Questions
- [ ] 

## After Class
- [ ] Review notes
- [ ] Do exercises
- [ ] Ask questions
`,
"template.class_notes.description": "Structured notes for lectures and courses.",
"template.class_notes.name": "Lecture Notes",
"template.cornell.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [cornell]
---

| Cue column | Notes |
| --- | --- |
| Keywords, questions | Main notes, diagrams, examples |

> Write keywords and questions on the left, then take notes on the right.
> Review within 24 hours, cover the notes and quiz yourself from the cue column.

## Summary

Summarize the page in your own words in 1-3 sentences. {{cursor}}
`,
"template.cornell.description": "The classic cue-column-summary layout for lectures and reading.",
"template.cornell.name": "Cornell Notes",
"template.dev_daily.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [dev]
---

## Today
- [ ] 
- [ ] 

## Details
- 

## Commits / PRs
- 

## Blockers
- 

## Open Questions
- 

## Tomorrow
- [ ] 

## Learned
- 
`,
"template.dev_daily.description": "Daily developer log: progress, blockers and next steps.",
"template.dev_daily.name": "Dev Daily Log",
"template.diary.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [diary]
---

## Mood
- Energy (1-5):
- Mood (1-5):

## Today's Highlights
1. 

## What Happened
- 

## Gratitude
- 

## Tomorrow
- [ ] 

{{cursor}}
`,
"template.diary.description": "A dated diary entry with mood, highlights and gratitude.",
"template.diary.name": "Diary Entry",
"template.expense_log.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [expense]
---

## Daily Spending
| Item | Category | Amount |
| --- | --- | --- |
|  |  |  |

## Category Totals
- Food:
- Transport:
- Shopping:
- Other:

## Budget Check
- Daily budget:
- Spent today:
- Remaining this month:

## Notes
- 
`,
"template.expense_log.description": "Track daily spending by category and compare to budget.",
"template.expense_log.name": "Expense Log",
"template.feynman.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [feynman]
---

## Concept

## Plain-Language Explanation

Pretend you are teaching an 8-year-old:

> 

## Gaps Found
1. 

## Simplify & Retry

Rewrite with an analogy:

## Final Check
- [ ] Can I explain it without jargon?
- [ ] Can I give a concrete example?
`,
"template.feynman.description": "Explain a concept in plain language to find your knowledge gaps.",
"template.feynman.name": "Feynman Technique",
};
