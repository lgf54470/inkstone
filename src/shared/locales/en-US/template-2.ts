export const messages = {
"template.four_quadrant.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [priority]
---

## 1. Important & Urgent — do now
- [ ] 

## 2. Important & Not Urgent — schedule
- [ ] 

## 3. Not Important & Urgent — delegate
- [ ] 

## 4. Not Important & Not Urgent — drop or limit
- [ ] 

> Principle: protect time for quadrant 2; the most meaningful work lives there. {{cursor}}
`,
"template.four_quadrant.description": "Prioritize tasks by urgency and importance into four quadrants.",
"template.four_quadrant.name": "Four Quadrants",
"template.gtd.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [gtd]
---

## Inbox
- 

## Next Actions
- [ ] 

## Waiting For
- [ ] 

## Projects
- [ ] 

## Someday / Maybe
- 

## Calendar
- {{today}}:
- {{tomorrow}}:

> Weekly review: empty the inbox, update lists, and decide the next physical action for each project.
`,
"template.gtd.description": "Capture, clarify, organize, reflect and engage with your commitments.",
"template.gtd.name": "GTD Task Management",
"template.habit_tracker.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [habits]
---

## Habits
- [ ] 
- [ ] 
- [ ] 

## Monthly Grid

| Date | Habit 1 | Habit 2 | Habit 3 |
| --- | --- | --- | --- |
| 1 |  |  |  |
| 2 |  |  |  |
| 3 |  |  |  |

## Notes
- Missed a day? Don't break the chain — just continue. {{cursor}}
`,
"template.habit_tracker.description": "Track daily habits across a month with a simple grid.",
"template.habit_tracker.name": "Habit Tracker",
"template.knowledge_cards.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [cards]
---

## Idea

> One sentence.

## Notes

## Sources
- 

## Related
- [[Related Note]]

## Actions
- [ ] 

> Write it as if you will never see the original source again. {{cursor}}
`,
"template.knowledge_cards.description": "One idea per card for building a personal knowledge base.",
"template.knowledge_cards.name": "Knowledge Cards",
"template.marketing_plan.content": `---
title: {{title}} Marketing Plan
createdAt: {{createdAt}}
tags: [marketing]
---

## Campaign Overview
- Goal:
- Target audience:
- Launch date:

## Channels
- [ ] Social media
- [ ] Email
- [ ] Content / SEO
- [ ] Paid ads

## Content Plan
| Date | Channel | Topic | Status |
| --- | --- | --- | --- |
|  |  |  |  |

## Budget
| Item | Planned | Actual |
| --- | --- | --- |
| Ads |  |  |
| Production |  |  |

## Success Metrics
- 

## Review
- {{tomorrow}}
`,
"template.marketing_plan.description": "Plan a campaign: audience, channels, budget and timeline.",
"template.marketing_plan.name": "Marketing Plan",
"template.meal_log.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [food]
---

## Breakfast
- 

## Lunch
- 

## Dinner
- 

## Snacks
- 

## Daily Check
- Calories:  / 
- Water:  glasses
- Feeling:
- 

> Honest records beat perfect records. {{cursor}}
`,
"template.meal_log.description": "Track meals, calories and how you feel afterwards.",
"template.meal_log.name": "Meal Log",
"template.meeting_minutes.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [meeting]
---

## Meta
- Time:
- Attendees:
- Absent:

## Agenda
1. 

## Discussion
- 

## Decisions
1. 

## Action Items
- [ ] Owner:  · Due: 

## Next Meeting
- {{tomorrow}}
`,
"template.meeting_minutes.description": "Capture decisions, action items and owners from a meeting.",
"template.meeting_minutes.name": "Meeting Minutes",
"template.mistake_notebook.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [mistakes]
---

## Subject

## Original Problem

## My Mistake

## Correct Approach

## Root Cause
- [ ] Careless
- [ ] Knowledge gap
- [ ] Wrong method

## Retest Date
- {{tomorrow}}
`,
"template.mistake_notebook.description": "Log mistakes with the correct approach to avoid repeating them.",
"template.mistake_notebook.name": "Mistake Notebook",
"template.morning_pages.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [journal]
---

## Free writing

Start writing whatever comes to mind. Don't edit, don't stop.

{{cursor}}

## One-line today

## Intention
`,
"template.morning_pages.description": "Three pages of stream-of-consciousness writing to clear your mind.",
"template.morning_pages.name": "Morning Pages",
"template.movie_log.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [movies]
---

## Seen

### {{date}}
- Title:
- Rating: ⭐⭐⭐
- Review:
- Favorite scene:

## Want to Watch
- [ ] 
- [ ] 

## Yearly Stats
- Total:
- Favorites:
`,
"template.movie_log.description": "Track films and shows with ratings and quick reviews.",
"template.movie_log.name": "Movie & Show Log",
"template.okr.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [okr]
---

## Objective 1

- [ ] KR 1.1: 
- [ ] KR 1.2: 
- [ ] KR 1.3: 

## Objective 2

- [ ] KR 2.1: 
- [ ] KR 2.2: 

## Weekly Check-in
| Week | Progress | Blockers |
| --- | --- | --- |
|  |  |  |

> KRs should be measurable, ambitious and time-bound. Review weekly.
`,
"template.okr.description": "Objectives and key results to align ambitious goals with measurable outcomes.",
"template.okr.name": "OKR Goals",
"template.pdca.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [pdca]
---

## Plan
- Goal:
- Current status:
- Root causes:
- Actions to take:

## Do
- [ ] 
- [ ] 

## Check
- Results vs plan:
- What worked:
- What did not:

## Act
- Keep:
- Adjust:
- Next cycle starts: {{tomorrow}}
`,
"template.pdca.description": "Plan-Do-Check-Act loop for continuous improvement.",
"template.pdca.name": "PDCA Cycle",
"template.pomodoro.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [pomodoro]
---

## Today's Goal

## Pomodoros

| # | Task | Interruptions | Done |
| --- | --- | --- | --- |
| 1 |  |  | [ ] |
| 2 |  |  | [ ] |
| 3 |  |  | [ ] |
| 4 |  |  | [ ] |

## Notes
- 

> Rhythm: 25 min work, 5 min break; every 4 pomodoros take a longer break. {{cursor}}
`,
"template.pomodoro.description": "25-minute focus sprints with short breaks.",
"template.pomodoro.name": "Pomodoro Technique",
"template.prd.content": `---
title: {{title}} PRD
createdAt: {{createdAt}}
tags: [product]
---

## Background
- Problem:
- Why now:

## Goals
1. 

## Non-Goals
- 

## Target Users
- 

## User Stories
- As a ..., I want to ..., so that ...

## Scope
### In Scope
- [ ] 

### Out of Scope
- 

## Acceptance Criteria
- [ ] 

## Metrics
- 

## Open Questions
- 
`,
"template.prd.description": "Product requirements: background, users, scope and acceptance criteria.",
"template.prd.name": "Product Requirements",
};
