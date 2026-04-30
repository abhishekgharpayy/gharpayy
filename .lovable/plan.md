# Zones — match old CRM 1:1, separate sidebar route, fix rename

## What we're doing

1. Move zones **out of Settings** into a standalone `/zones` route with its own sidebar entry (super_admin only — same gating as Settings).
2. Make the page match the old CRM's Zones tab exactly: card grid, color dot, city line, area chips, "New Zone" + "Edit Zone" dialogs.
3. Add 3 fields when creating/editing a zone (matching old CRM):
   - **Zone name** (required) — e.g. "Marathahalli Cluster"
   - **City** (text, defaults to "Bangalore")
   - **Areas** — comma-separated input (e.g. "Marathahalli, Varthur, Kundalahalli"), stored as `string[]`
   - Plus the old CRM's color picker (8 preset swatches) — small but it's part of the visual parity
4. Fix "Failed to fetch" on rename.
5. Defer Team Queues + Escalations tabs from the old CRM (you said "3 options to add" was the focus). They can come later.

## Why "Failed to fetch" happens & the fix

The new `PUT /api/zones/:id` route is committed in this repo (`server/src/modules/zones/routes.ts`) and registered in `server/src/index.ts`, but your VPS still runs the older build that only had `GET` + `POST`. `list` works because GET existed before; `update` returns a 404 from the Node process which the browser surfaces as a network failure if the older build also lacked the route prefix.

**Fix is operational, not code:** redeploy the backend on your VPS. After implementation I'll give you the exact command. CORS is already wide open via `@fastify/cors` for all methods.

I'll also harden the backend in this pass:
- Extend `ZoneDoc` with `city: string` and `areas: string[]` and `color: string`.
- Accept those fields in POST + PUT (zod schemas).
- Return them in the response shape.
- Backfill seed zones with empty `city: ""`, `areas: []` so existing data isn't broken.

## Files to change

### Backend
- `server/src/modules/zones/routes.ts` — extend `ZoneDoc` (add `city`, `areas`, `color`), update `CreateBody` + `UpdateBody` zod schemas, update list/create/update responses to include all fields. Seed zones get empty city/areas/color.

### Frontend
- `src/lib/api/client.ts` — extend `Zone` shape returned by `api.zones.*` to `{ id, name, city, areas, color }`. Update `create`/`update` signatures to accept the full payload.
- `src/routes/zones.tsx` — **NEW** route. Wraps `<ZonesPage />` in `<AppShell>`. Super-admin gated (redirect non-admins to `/`).
- `src/components/ZonesPage.tsx` — **NEW**. Mirrors the old CRM Zones tab: header with "X active zones" count + "New Zone" button, card grid with color dot, name, "City: …" line, area chips, edit pencil. New/Edit dialog: 3 inputs (name, city, areas) + 8-color swatch picker. Same copy/placeholders as old CRM.
- `src/components/AppShell.tsx` — add `{ to: "/zones", label: "Zones", icon: MapPin }` to the super_admin nav array (placed right above Settings).
- `src/components/settings/SuperAdminSettingsPanel.tsx` — remove the Zones tab from the tabs array.
- `src/components/settings/ZonesTab.tsx` — delete (no longer used).

## Old CRM dialog reference (what I'm copying)

```text
┌─ Create Zone ──────────────────────┐
│ [Zone name (e.g. Marathahalli ...)] │
│ [City                            ]  │
│ [Areas (comma-separated: M, V, K)]  │
│ ● ● ● ● ● ● ● ●  ← 8 color swatches │
│ [        Create Zone        ]       │
└────────────────────────────────────┘
```

Card layout:

```text
┌──────────────────────────┐
│ ● Marathahalli Cluster ✎ │
│ City: Bangalore          │
│ [Marathahalli] [Varthur] │
│ [Kundalahalli]           │
└──────────────────────────┘
```

## After I implement — VPS redeploy

```bash
cd /root/desktop/tdynil/server
git pull && npm run build && pm2 restart all
```

Then test rename in /zones — it'll work.

## Out of scope (ask later if you want)
- Team Queues tab (old CRM had one — needs a `team_queues` collection + member assignment)
- Escalations tab (needs `escalations` collection + workflow)
- Linking zones to lead routing in the lead create/assign flows
