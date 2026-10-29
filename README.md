# Module Planner

A dependency-free, responsive assignment tracker. Production files are in `dist/`; serve that directory with any static host. Your personal assignments are never committed with the application source.

## Features

- Assignment CRUD, duplication, completion and delete/undo; module grouping, search, status filters and sort.
- Deadlines with explicit IANA time zones, editable effort estimates and suggested ranges, weighting, automatic/manual priorities, notes and assessment links.
- Checklists and removable study-time logs. Time remaining is total estimate minus logged hours; completing a checklist is distinct from marking an assessment submitted.
- A 14-day earliest-deadline study allocation with daily capacity, optional weekends, buffer-aware suggested start dates, overdue and overload warnings.
- JSON backup/import, CSV import/export, reviewed Moodle ICS import with UID deduplication, deadline calendar export with one-day reminders, and a print layout.
- Automatic local storage, optional GitHub JSON storage, manual pull/merge/push, SHA concurrency checks, three-way record merge and deletion tombstones. A conflict never automatically overwrites another device's record.
- Responsive touch controls, semantic forms, keyboard focus, reduced motion, install manifest and a service worker for cached offline assets where supported. No third-party runtime scripts.

## GitHub data storage

The hosted app cannot reuse the chat's GitHub connection. Open **Storage & settings → GitHub storage** for exact setup menus. Create a private repository with a README (so `main` exists) and a fine-grained token limited to that repository with Contents read/write. Enter that token only in the app. It stays in tab memory and is sent only to `https://api.github.com`; source code, local settings and backups never contain it.

Connect and pull before editing on a new device. Click **Save to GitHub** after local changes. Sync is manual and needs internet. Public repositories are refused unless explicitly allowed. Repo/branch/path preferences are stored locally without the token. On conflicts, export backups from each device and review the conflicting assignment before retrying. GitHub commit history can recover older file versions.

## Moodle

This build has **no Moodle account connection and no real assignments populated**. Import a downloaded Moodle calendar (`.ics`) or add assignments manually from assessment briefs. Imported calendar events default to 8h effort and an unconfirmed module; review them. Recurring events are skipped, unsupported times warn, and all-day events are assigned 23:59 with an explicit warning. Calendars can omit assessments, so cross-check every module's assessment page. JSON import merges assignments only; study settings are retained on the device.

## Planning limits

Estimates are heuristics, not university workload promises. The suggested start subtracts required study days and a configurable buffer. The study allocation plans from today by deadline, using the entire daily capacity even if part of today has passed. Work scheduled on a deadline date is flagged for timing review; it is not counted as safely before that deadline. Today’s available hours and individual extensions need manual adjustment. Background reminders are delegated to your calendar app, not a push notification server.

## Development and validation

```
npm ci
npm test
npm run check
python -m http.server 8000 --directory dist
```

Development dependencies are only for tests; there is no production build step. Core tests cover DST, estimates, daily allocation, imports, calendar escaping, UTF-8 transport, merge conflicts, deletions and GitHub optimistic writes. A DOM integration test covers create/edit/complete, checklists, time logging, filters, settings, duplicate and undo. A real-browser visual/mobile review and authenticated live GitHub data sync require the user's connection and are not established by these tests.
