# Module Planner

A dependency-free, responsive assignment tracker. Production files are in `dist/`; serve that directory with any static host. Your personal assignments are never committed with the application source.

## Features

- Assignment CRUD, duplication, completion and delete/undo; module grouping, search, status filters and sort.
- A single Given on → Deadline timeline with explicit IANA time zones, editable effort estimates, weighting, date-based urgency, notes and assessment links.
- Editable suggested workflows for each assessment type, per-step instructions and links, an assignment-specific academic search link and custom resource links. Suggestions are templates, not extracted module requirements.
- Checklists and removable study-time logs. Time remaining is total estimate minus logged hours; completing a checklist is distinct from marking an assessment submitted.
- A 14-day plan spreading remaining work across the release-to-deadline window. No separate start date, daily capacity or buffer. Missing dates are flagged; past deadlines are kept out of future sessions. Each session names the steps, explains what to do and provides resource links.
- JSON backup/import, CSV import/export, reviewed Moodle ICS import with UID deduplication, deadline calendar export with one-day reminders, and a print layout.
- Automatic local storage, optional GitHub JSON storage, manual pull/merge/push, SHA concurrency checks, three-way record merge and deletion tombstones. A conflict never automatically overwrites another device's record.
- Responsive touch controls, semantic forms, keyboard focus, reduced motion, install manifest and a service worker for cached offline assets where supported. No third-party runtime scripts.

## GitHub data storage

The hosted app cannot reuse the chat's GitHub connection. Open **Storage & settings → GitHub storage** for exact setup menus. Create a private repository with a README (so `main` exists) and a fine-grained token limited to that repository with Contents read/write. Enter that token only in the app. It stays in tab memory and is sent only to `https://api.github.com`; source code, local settings and backups never contain it.

Connect and pull before editing on a new device. Click **Save to GitHub** after local changes. Sync is manual and needs internet. Public repositories are refused unless explicitly allowed. Repo/branch/path preferences are stored locally without the token. On conflicts, export backups from each device and review the conflicting assignment before retrying. GitHub commit history can recover older file versions.

## Moodle

This build has **no Moodle account connection and no real assignments populated**. Import a downloaded Moodle calendar (`.ics`) or add assignments manually from assessment briefs. Imported calendar events default to 8h effort and an unconfirmed module; review them. Matching terminal opens/closes events are paired automatically: the opens event supplies the release date (and known release time) and the closes event supplies the deadline. Matching is restricted by title, module and Moodle activity identity. Ambiguous or reversed pairs stay separate with a review warning. An unmatched opens event never becomes a deadline. Recurring events are skipped, unsupported times warn, and all-day opening events use 00:00 and closing or general events use 23:59, with an explicit time-verification warning. Calendars can omit assessments, so cross-check every module's assessment page. JSON import merges assignments only; study settings are retained on the device.

## Planning rules

The only scheduling dates are `given` (YYYY-MM-DD, in the assignment time zone) and `due` (an ISO timestamp). Work starts no earlier than the given date or today and never extends past the deadline. Remaining estimated hours are distributed equally across the available calendar days, with pending checklist stages split across those sessions. Session hours are approximate amounts, not booked time slots or guaranteed available capacity. Estimates exceeding the entire remaining window are flagged.

Legacy daily-hours, weekend and buffer settings are preserved in backups for compatibility but ignored by the new planner; old manual priority is also ignored in favour of date-based urgency. Unknown release dates are never inferred from event creation time or import time. A known opens timestamp also prevents planning work before the actual release time on that date. Existing tasks need their real release date added before they can appear in the plan. Imported calendar deadlines without an opens counterpart leave that date blank; paired events populate it automatically.

Suggested steps depend on assessment type, not on an AI reading the full brief. The brief remains authoritative. Each suggestion can be edited; existing custom checklist items and completions are retained. Personal links and rich step details survive JSON backups and GitHub sync. Resource links point to Moodle, the university library, academic search and relevant writing/programming guidance; their live contents were not verified in this environment.

## Development and validation

```
npm ci
npm test
npm run check
python -m http.server 8000 --directory dist
```

Development dependencies are only for tests; there is no production build step. Core tests cover DST, estimates, release/deadline bounds, midnight cutoffs, imports, calendar escaping, UTF-8 transport, merge conflicts, deletions and GitHub optimistic writes. A DOM integration test covers create/edit/complete, checklists, time logging, filters, generated guides, next-step changes, plan-to-checklist navigation, custom resources, settings, duplicate and undo. A real-browser visual/mobile review and authenticated live GitHub data sync require the user's connection and are not established by these tests.

## Opens/closes repair and interoperability

On load, the app repairs matching saved calendar pairs and saves one raw local backup under `module-planner:before-event-merge`. Export it in Storage & settings if needed. The closing entry keeps its ID and submission status; completing an opening reminder never counts as submitting the assessment. Unique checklist items, completion flags, study logs, notes and links from both entries are retained. Estimates describe the same assignment, so they are not added together. The larger estimate is retained at initial pairing; subsequent imports retain your existing edited estimate.

Both calendar UIDs and source record IDs are stored on the merged assignment. Reimporting either event or both updates its dates without duplicating it or resetting progress. Partial imports arriving in either order can still pair. JSON backups retain all pairing metadata. Calendar exports retain the module and known release date in addition to the deadline; they remain deadline calendars, not full progress backups. Duplicating an assignment intentionally clears calendar identities so later imports cannot change the copy.

GitHub merging normalises both local and remote pairs, including its comparison baseline. Pairing tombstones prevent removed opening records being resurrected during sync. Pull only advances its baseline after the device saves successfully. GitHub writes are still manual and require the user's repository token; automated tests use a simulated provider. Visual browser QA and authenticated live provider tests were unavailable in this session.
