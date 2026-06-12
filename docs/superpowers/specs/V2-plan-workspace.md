# Akari V2 Plan Workspace Design

> 过程归档：本文件已合并进 `../../V2-design.md`，当前事实以根目录权威文档和代码为准。

Last updated: 2026-06-11

V2 should move Akari from "AI generates a plan" to "the user owns an editable plan workspace, and Agent helps maintain it." Plans must be visible, versioned, importable, and allowed to be incomplete.

## Current Behavior

Current plan generation is week-scoped:

- `generateInitialPlan()` creates one active goal and one current-week plan.
- `generate_plan` writes tasks for one `week_start`.
- If the same week is regenerated, old tasks for that weekly plan are replaced.
- Old goals/plans are archived, not deleted.

This is useful for MVP, but too rigid for real exam preparation because tasks change daily and Akari does not yet have enough exam-domain evidence to confidently create a full long-term schedule from scratch.

## Product Direction

### Plan Ownership

The user should be able to use Akari in three modes:

- Agent-generated plan: user gives goal, Agent drafts a plan.
- User-authored plan: user writes goals/tasks manually; Agent only organizes and checks.
- Evidence-driven plan: user imports wrong-question PDFs, notes, or schedules; Agent derives suggested tasks.

Weekly tasks may be empty. A valid plan can be as small as:

- long-term goal only
- one weekly focus
- one daily task
- one wrong-question review queue

Agent should make gaps visible, not block usage.

### Rolling Plan

Akari should avoid pretending it knows the entire path. The better default is:

- maintain long-term target and current level
- generate a 7-day working plan
- adjust tomorrow and next week from completion feedback and error patterns
- keep old versions available for review or restore

This makes plans resilient to skipped days, overload, unexpected time changes, and imported new evidence.

### Exam Knowledge Gap

Akari should not rely only on generic LLM planning. It needs a local exam-planning knowledge base:

- module taxonomy: 行测/申论/面试 modules and subtypes
- common practice sequences for each module
- recommended weekly cadence by available hours
- mock exam frequency rules
- review spacing rules for wrong questions
- sprint vs foundation phase templates

The first practical source can be user evidence, especially exported Fenbi wrong-question PDFs.

## Markdown Plan Documents

Akari now syncs the active database plan to:

```text
Akari-WorkSpace/
  plans/
    current-plan.md
    history/
      YYYY-MM-DD-goal_xxx.md
```

For now this is one-way: database -> Markdown. Later it should support:

- import Markdown back into tasks
- detect manual edits
- show diff before applying
- restore previous versions
- export plan as PDF

## Plan Version Management

Future UI should expose a Plan Versions panel:

- active plan
- draft plans
- archived plans
- discarded plans
- imported plans

Each version should show:

- source: user / agent / import / adjustment
- created time
- week range
- task count
- completion stats
- linked plan document path

Allowed actions:

- view
- restore as active
- duplicate as draft
- export
- delete only after explicit user confirmation

## Fenbi Wrong-Question Import

If Fenbi has no API but supports exporting wrong-question PDFs, V2 can support:

1. User exports wrong-question PDF from Fenbi.
2. User uploads it into Akari workspace.
3. Akari extracts text with PDF parser.
4. Agent creates `learning_artifacts`.
5. Agent proposes `error_candidates`.
6. User confirms/edit candidates.
7. Akari aggregates weak modules and causes.
8. Akari proposes plan changes or creates review tasks.

The plan should be evidence-driven:

- many 资料分析计算 mistakes -> add calculation drills
- many 言语主旨 mistakes -> add reading/comprehension review
- repeated careless errors -> add slower review + checklist tasks
- low completion feedback -> reduce next-day load

## Near-Term Implementation Order

1. Plan Markdown sync: current active plan writes to `plans/current-plan.md`.
2. Plan document UI entry in workspace.
3. Plan versions API: list archived/current plans and restore a selected version.
4. Manual plan authoring: create goal without generated tasks; add/edit tasks freely.
5. Import pipeline for Fenbi PDFs and user Markdown schedules.
6. Evidence-driven task suggestions from confirmed error candidates.
7. Rolling plan adjustment based on feedback and confirmed errors.

## Non-Goals For Immediate V2

- Do not delete archived plans automatically.
- Do not silently apply imported PDF-derived tasks without user confirmation.
- Do not pretend Akari has a complete official exam curriculum.
- Do not generate a full multi-month plan as fixed daily tasks.
- Do not rely on Fenbi private APIs or scraping.
