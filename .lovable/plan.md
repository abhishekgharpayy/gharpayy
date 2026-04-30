## Goal
Make `/myt/leads` look like a clean production CRM, and remove the global persona-pulse strip across the whole app.

## Changes

### 1. Remove global persona pulse strip (everywhere)
File: `src/components/AppShell.tsx`
- Delete the `PersonaPulse` component (lines ~40–69) and its render call inside `AppShell`.
- Drop now-unused props/derivations only used for it (`bookingsCount` if unused elsewhere, etc. — keep `queueCount`/`overdueCount` if still consumed by other UI; verify before removing).
- Result: the "super-admin · Owner control: approve what is blocking sellable inventory · generalist · 0 live tasks" strip disappears on every page.

### 2. Trim toolbar on `/myt/leads`
File: `src/myt/pages/MYTLeadTracker.tsx`
- Remove the entire right-side button cluster: **Open PiP**, **PiP Add Lead**, **PiP Manage**, **Quick Add**, **Run Parser Test**.
- Keep the title + subtitle on the left, but compact them.
- Remove the PiP "not supported" info banner (no longer relevant once PiP buttons are gone).

### 3. Merge mode tabs + KPIs into one row
Replace the separate "mode tabs" block and the 2-card stats grid with a single horizontal bar:

```text
[ Quick Add | Manual | Requests ]            ✅ 0 MYT Qualified   ❌ 0 Not Qualified
```

- Left: segmented control (Quick Add / Manual / Requests) — reuse existing `mode` state, restyled as a clean pill group.
- Right: two inline stat chips (qualified count in success tone, not-qualified in danger tone) — same numbers, just inline instead of cards.
- One row, border-bottom separator, no glass cards needed for the stats.

### 4. General polish on the page
- Consistent spacing: change top-level `space-y-4` to `space-y-3`, unify card padding (`p-4`).
- The "Unified Quick Add" hint card: shrink to a slim helper row only when `mode === 'quick'` and no leads — otherwise hidden, since the segmented control already exposes it.
- Qualified / Not-qualified list cards: keep, but tighten header sizing to `text-xs uppercase tracking-wide` for a CRM feel; remove emojis from headers, use the existing `CheckCircle` / `XCircle` icons inline.
- Keep `QuickAddLeadPanel` and `ParserTestModal` mounted (they still open from the segmented control + from existing flows elsewhere).

## Non-goals
- No data model or routing changes.
- Other pages keep their existing toolbars; only the global pulse strip is removed.

## Files touched
- `src/components/AppShell.tsx`
- `src/myt/pages/MYTLeadTracker.tsx`
