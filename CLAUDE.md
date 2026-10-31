# Photo Printer

Desktop app (Tauri 2 + React 19 + TypeScript + Vite, same stack as `../git-tool`) that lays out multiple photos on A4 paper and prints them. Targets macOS, Windows, Linux. One session at a time, no saved projects.

## Decisions (v1)
- Layouts: grid presets (1/2/4/6/8/9 per page) and physical photo sizes (passport, wallet, 4x6, 5x7 ...). One size per page; copies fill the sheet, overflow spills to more pages.
- Margins, gaps, cut lines, per-photo crop (pan/zoom) and rotate.
- Output: one PDF is the source of truth. Export saves it; print opens it with the OS. Preview and PDF use the same layout function, so they can't drift.
- Paper: A4 only for now. Keep page size as data (`{ w: 210, h: 297 }` mm), never hard-code A4 numbers elsewhere.
- All layout math in mm. Convert to pt (`mm * 72 / 25.4`) only at the PDF boundary.
- Physical sizes must print at "Actual size", not "Fit to page"; keep a printer scale calibration knob.

## Planning (ai-planner MCP)
Source of truth: `project: "photo-printer-app"`, `service: "photo-printer"`. Main plan: `001-photo-printer-app-v1`. No plan docs in the repo. Fallback REST: `https://planner.tinkeshwar.in/api/{plans,audits,issues}`.
- **Plan:** design, may have open questions; create as `draft`, no `NNN-` prefix in the title. Never write or file a plan without user approval. Never implement directly; once approved, split into ≥1 issue per phase (plan slug in each issue, issue IDs listed in the plan).
- **Audit:** review report for one service.
- **Issue:** `bug|feature|enhancement|task`, zero open questions, one problem each.
- **Docs:** guides. Never create one without approval.
- Numbers ("issue 4", "plan 001") → `get_*_by_number` first, else match the slug prefix.
- Open question or unresolved decision → stop and ask via `AskUserQuestion`; write the answer into the doc.
- Update status in the same turn it changes, and append `**Status:** <New> YYYY-MM-DD. <Reason>`. Plans: `draft → active → done`. Issues: `open → fixed → resolved | closed` (closed needs a rationale).
- Always create 1 spike ticket for out-of-scope items.

## Run
- `npm install && npm run tauri dev`; check with `npm run build` and `npm test`.
- Tests: `node --test` on `src/*.test.ts` (Node ≥23 strips types natively, no runner dep). Test files are excluded from `tsc`; keep tested modules DOM-free and free of TS-only syntax (enums, namespaces).
- `src/layout.ts` is the single layout function for preview and PDF.
- **Never commit.** Leave changes uncommitted; the user commits.
