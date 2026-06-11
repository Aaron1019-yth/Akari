# Akari V1 Demo Script

Last updated: 2026-06-11

This checklist is the canonical V1 MVP smoke/demo path. It keeps V1 focused on the shipped capability: conversational planning, task management, workspace document reading, and session persistence.

## Before Demo

1. Install dependencies:

```bash
npm install --legacy-peer-deps
```

2. Start the web app:

```bash
npm run dev:web
```

3. Open `http://127.0.0.1:5173/`.

4. In Settings, configure:

- DeepSeek API key
- Base URL, usually `https://api.deepseek.com`
- Model, usually `deepseek-v4-flash`
- Optional web search provider key: Tavily, Serper, or Brave
- Optional workspace path, default `~/Desktop/Akari-WorkSpace`

## Demo Flow

### 1. Start A New Planning Conversation

Use a prompt like:

```text
我想准备广东省考，每天大概能学 3 小时。之前做过行测真题，正确率大概 60%，资料分析和数量关系比较弱，申论没怎么练过。
```

Expected result:

- Akari asks follow-up questions if required fields are missing.
- When enough information is available, Akari generates a one-week plan.
- The right workbench refreshes and shows the generated plan.

### 2. Verify Plan Operations

In the workbench:

- Switch between today and week views.
- Mark one task completed.
- Double-click a task and edit its title or estimated minutes.
- Drag a task to another time slot or day.
- Start a pomodoro timer and record actual minutes.

Expected result:

- The plan persists after refresh.
- `GET /api/planner/goal` reflects task edits and completion state.

### 3. Verify Workspace

Upload one supported file, such as PDF, DOCX, Markdown, TXT, CSV, JSON, YAML, XML, HTML, TEX, RTF, or LOG.

Expected result:

- The file appears in the workspace file tree.
- Opening the file switches to single-file preview mode.
- Closing the file tab returns to the file list.
- Rename/delete via context menu works.

### 4. Ask Agent To Read Workspace Documents

Use a prompt like:

```text
请读取我刚上传的资料，总结里面和我本周计划相关的重点，并告诉我今天该优先学什么。
```

Expected result:

- The Agent calls workspace document tools.
- The answer references document content and connects it to the current plan.

### 5. Verify Sessions

- Create another session.
- Send a short message.
- Switch back to the first session.
- Delete the second session.

Expected result:

- Session history persists in `.akari/memory/sessions/*.jsonl`.
- Deleting a session refreshes the list and does not leak diagnostic state into other sessions.

## Final Checks

Run:

```bash
npm run build
npm run test:api
```

Expected result:

- Build passes.
- API tests pass.

## V1 Frozen Boundary

Do not add these to V1:

- Multi-file tabs, split editor, quick open, or recent files.
- Legacy `.doc` parsing.
- Electron DMG packaging.
- Daily error-entry UI, learning reflections, weekly reports.
- Adaptive plan diff or automatic next-week adjustment.
- Large frontend restructuring beyond small bug-driven changes.
