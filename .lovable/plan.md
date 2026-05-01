## What's broken (root causes)

1. **Validation bypass on Paste flow**: `LeadPasteParser.tsx` only requires Name + Phone + Zone. Lead Quality, Type, Full Address, Room, Need, In-BLR, Move-in, Email, Areas, Budget, Assignee, Stage are all optional → that's why your incomplete lead saved. `QuickAddLeadPanel.tsx` already validates everything; Paste must mirror it.

2. **New leads invisible everywhere**: Quick Add / Paste / Direct write to a browser-only zustand store (`useIdentityStore`, persisted in localStorage). They never hit your VPS Mongo. Meanwhile `/leads`, `/myt/leads`, `/live-leads` each read from a *different* store. So you literally cannot see a lead you just added — not on another tab, not on another device, not as another user.

3. **No role-based visibility**: backend `GET /api/leads` filters only by `tenantId`. Every signed-in user in the tenant sees every lead.

## Fix plan

### A. Make backend the single source of truth for leads

1. **Extend `Lead` entity** (`src/contracts/entities.ts`) with the rest of the Quick Add fields:
   - `email`, `areas: string[]`, `fullAddress`, `type`, `room`, `need`, `inBLR: boolean | null`, `quality: "hot"|"good"|"bad"|null`, `specialReqs`, `notes`, `zoneCategory`, `assigneeId`, `stageLabel` (long stage name like "MYT [TENANT]")
   - Keep `stage` enum + `assignedTcmId` for legacy compatibility; new fields are additive and optional with sensible defaults.

2. **Extend `cmd.lead.create` payload** (`src/contracts/commands.ts`) to accept the new fields. Server `applyCommand` (`server/src/modules/leads/command-handlers.ts`) writes them straight to Mongo and emits the existing `evt.lead.created`.

3. **Rewire the three save paths** to dispatch `cmd.lead.create` instead of `useIdentityStore.createLead`:
   - `QuickAddLeadPanel.tsx`
   - `LeadPasteParser.tsx`
   - `DirectLeadForm.tsx`

   On success, show toast + refresh (`useLiveLeads.refresh()` runs automatically via socket `evt.lead.created`).

### B. Enforce ALL required fields on Paste + Direct flows

4. Replace `LeadPasteParser`'s 3-field check with the full Quick Add validator (Name, valid 10-digit Phone, Email, Areas, Full Address, Budget, Move-in, Type, Room, Need, In-BLR, Quality, Zone, Assignee, Stage). Same toast format as Quick Add.

5. Update `DirectLeadForm.tsx` to require the same fields (currently only Name/Phone are required). Show inline errors on blur and a "Fill all required fields: …" toast on submit.

### C. Role-based visibility (server-authoritative)

Backend rule:
- **member** → leads where `assignedTcmId == self.id` OR `createdBy == self.id`
- **admin** → leads where `zoneId` ∈ admin's `zones[]` (any lead inside any zone the admin owns), regardless of who created it
- **manager** → all leads in tenant
- **super_admin** → all leads in tenant

6. **`GET /api/leads`** (`server/src/modules/leads/routes.ts`):
   - Read `req.user.role` and `req.user.zones` from JWT.
   - Apply the visibility filter above on top of the existing `tenantId` filter.
   - Same filter applies to the `lead.read` scope check on `GET /api/leads/:id` (404 if not visible, not 403, to avoid id-enumeration).

7. **JWT claims**: confirm `zones` is on the token (verify `server/src/auth/auth.ts`). If not, add it so the server can filter without a second DB hit.

8. **Frontend** keeps using `useLiveLeads` — no client-side role filter; the server is the truth. The list will simply only show what the user is allowed to see.

### D. Listing pages converge on `/api/leads`

9. `/myt/leads` qualified/not-qualified panels switch from `useAppState().leads` (mock) to `useLiveLeads()`, so a freshly-saved lead shows up immediately for the saver and for everyone else who's allowed to see it.

10. `/leads` (legacy mock) — leave the existing mock leads view alone for now but add a banner "Showing demo data — go to /live-leads for live data" so it's not confusing. (Or kill the page; ask after this lands.)

### E. Cleanup

11. Mark `useIdentityStore` as **client-only cache for dedup hints** (we still use it for `checkDuplicates` against currently-loaded leads). It no longer creates leads; backend dedup (existing `lead_phone_index` collection) is the real guard.

## Technical notes

- Phone normalization (`toE164`) on the backend already rejects bad numbers — we keep that.
- Backend dedup via `lead_phone_index` already returns the existing leadId on E11000 — Quick Add will surface that as "Duplicate detected" using the same toast UX it already has.
- Socket `evt.lead.created` already updates `useLiveLeads` for every connected client → live cross-user visibility is automatic.
- No DB migration needed; Mongo accepts additive fields. We just bump the entity zod schema.
- The "5 sub-stages" long stage names (`"MYT [TENANT]"`, `"4A. Visit Scheduled in BLR"` etc.) live in `stageLabel`. The narrow `LeadStage` enum (`new`, `contacted`, …) stays for funnel logic; we map long → short on save.

## Out of scope (call out separately if you want)

- Tour saving still uses local mock state — separate ticket.
- Manager / Admin org-tree UI (assigning members to admins by zone in Settings) — backend zone-based filter works today off existing `users.zones[]`, but a UI to verify is its own task.

Once approved I'll implement A → B → C → D in one pass.