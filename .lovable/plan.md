## Goal

Make the new CRM production-ready end-to-end:
1. Super Admin logs in with real credentials saved in MongoDB.
2. Super Admin sees a full **Settings** module (Users · Roles · Profile · Activity) and can create/edit/deactivate other users.
3. Each created user gets credentials saved in Mongo and can log in.
4. After login, the role drives the sidebar/nav as today.
5. **Roles match the old CRM exactly:** `super_admin`, `manager`, `admin`, `member`. The existing UI personas (Flow Ops, TCM, HR, Property Owner) stay in the **"View as"** dev-switcher — they are *display lenses*, not real DB roles. Super Admin is added to that dropdown as well (instant-switch, per your choice).

---

## Backend changes (`/server`)

### 1. Role model migration
- Replace top-role enum in `src/contracts/roles.ts` with `super_admin | manager | admin | member`.
- Update `DEFAULT_SCOPES`:
  - `super_admin` → all scopes (full power, can manage users)
  - `manager` → manage admins + read everything in their tree
  - `admin` → manage members in their zone(s), full lead/tour/inventory in zone
  - `member` → standard TCM/closer scopes (lead/tour read+update, todo, activity)
- Add a new scope: `user.admin` already exists; add `user.read` for managers/admins to list their subtree.
- One-shot migration script (`server/scripts/migrate-roles.ts`) that maps old docs (`admin→super_admin` for the bootstrapped user, `ops→manager`, `sales→member`, `owner→admin` if any exist). Run once on boot if `users` count > 0 and any old enum value detected.

### 2. User schema (Mongo)
Single `users` collection (drop the separate `user_roles` collection — old CRM stores role on the user doc and that matches your prompt). Fields:
```
_id, username (lowercase, unique), email (unique), phone,
passwordHash (argon2), fullName,
role: super_admin|manager|admin|member,
status: active|inactive|invited|deleted,
zones: string[],            // for admin/member
managerId: ObjectId|null,   // for admin
adminId:   ObjectId|null,   // for member
adminIds: ObjectId[],       // for manager (their admins)
memberIds: ObjectId[],      // for admin (their members)
invitedAt, deletedAt, createdAt, updatedAt
```
Indexes: `{username:1} unique`, `{email:1} unique`, `{role:1, status:1}`, `{zones:1}`.

### 3. Bootstrap Super Admin
On server boot, run `ensureDefaultSuperAdmin()`:
- username/email: `superadmin@gharpayy.com`
- password: `superadmin#gharpayy` (argon2-hashed)
- role: `super_admin`, status: `active`
- Idempotent — only creates if missing; if exists with stale fields, normalizes them.

### 4. Auth routes (`/api/auth/*`)
Already have `signup`, `login`, `logout`. Additions:
- `GET /api/auth/me` — returns current user (id, fullName, email, phone, role, zones).
- `PATCH /api/auth/update` — change own password / phone.
- `POST /api/auth/login` accepts **either** `email` **or** `username` (so old-CRM-style usernames work). Login response payload extended with `fullName`, `role`, `zones`.

### 5. New user-management routes (super_admin only)
- `GET    /api/users` — list, optional `?status=active|inactive|deleted`
- `POST   /api/users` — create user (validate role/zones/parent refs, hash password, write parent linkages)
- `GET    /api/users/:id`
- `PUT    /api/users/:id` — update profile/zones
- `PATCH  /api/users/:id` — `{ password }` reset
- `PATCH  /api/users/:id/status` — `{ action: activate|deactivate|delete }`
- `GET    /api/managers` — list managers (with `admins[]` populated)
- `GET    /api/admins` — list admins (with zones, parent manager)
- `GET    /api/members` — list members (with zones, parent admin)
- `GET    /api/zones` — list of canonical zones (seed: Zone1..Zone5, can extend)

All gated by `requireScope("user.admin")` which only `super_admin` has.

### 6. Activity log
Reuse existing `entity_event` collection. Add a thin read API:
- `GET /api/activity/login` — recent login/logout events (super_admin)
- `GET /api/activity/all` — recent system events (super_admin)
- `GET /api/activity/lead?leadId=…` — per-lead audit trail
On `login`/`logout` handlers, append `{type:"evt.user.login"|"evt.user.logout", userId, ts, ip, ua}` to `entity_event`.

### 7. Lead creation hardening
- `POST /api/commands` for `cmd.lead.create` already exists. Add server-side require that the caller has `lead.create` scope (super_admin/manager/admin/member all do).
- Auto-attribute `createdBy: req.user.sub` and (if member) `assignedTcmId: req.user.sub` so leads land in the right hands.

---

## Frontend changes (`/src`)

### 1. Real auth state
- Extend `tokenStore` with a parsed-user store (zustand `useAuthUser`) that hydrates from `/api/auth/me` on app boot.
- `src/routes/_authenticated.tsx` (pathless layout) with `beforeLoad` redirect-to-login when no token. Move all protected routes under it (root index → `/dashboard` etc.).
- Update `src/routes/login.tsx`: accept username OR email, post to `/api/auth/login`, store token, fetch `/me`, redirect to `redirect` search param or `/`.

### 2. Settings module
- New route `src/routes/settings.tsx` already exists but currently shows MYT settings. Replace with role-aware shell:
  - If `super_admin` → `<SuperAdminSettingsPanel />` (ported)
  - Else → existing `<ProfileTab />` only (change-password)
- Port `SuperAdminSettingsPanel` from old CRM into `src/components/settings/SuperAdminSettingsPanel.tsx`. Tabs:
  - **Users** — list/add/deactivate/delete users; subtabs Active/Inactive/Deleted; AddUserForm (fullName, email, phone, password, role select, zone checkboxes for admin/member, manager picker for admin, admin picker for member)
  - **Roles** — three sub-tabs Managers / Admins / Members with expandable rows showing children + inline edit + password reset
  - **Profiles** — same as own profile (read-only summary of the super admin)
  - **Activity** — port `ActivityTabs` (login activity + lead activity) reading from new `/api/activity/*` endpoints
- Add sidebar entry "Settings" (gear icon) for `super_admin` (and a profile-only Settings link for everyone else).

### 3. "View as" dropdown (bottom-left)
- Add `Super Admin` as the first option. Selecting it sets `role = "super_admin"` in `useApp` store. (Current behavior preserved — instant dev switch, no auth gate, per your choice.)
- Add a new persona/nav set for `super_admin`: Today, Settings, Users, Activity, Leads, Calendar.

### 4. Remove every remaining mock seed
Audit and zero out any leftover dummy seeds (TCMs, properties, bookings, follow-ups, handoffs in `src/lib/store.ts` and `src/myt/lib/properties-seed.ts`). Keep only structures; let live API populate them. The `LiveLeadsBridge` already handles leads.

### 5. API client extensions (`src/lib/api/client.ts`)
Add typed wrappers: `api.users.{list,create,update,patch,setStatus}`, `api.managers.list`, `api.admins.list`, `api.members.list`, `api.zones.list`, `api.activity.{login,all,lead}`, `api.auth.me`, `api.auth.update`.

### 6. Lead-add flow polish
- After login, "Add Lead" button (already in `QuickCreateMenu`) hits `cmd.lead.create` via the command bus; success toast + bridge updates store from the socket event. Verify the form passes `assignedTcmId` only when current user is a member; otherwise leave blank for ops to assign.

---

## Files to create / edit

```
server/
  src/contracts/roles.ts                      [edit]
  src/auth/auth.ts                            [edit] argon2 + new enum + ensureDefaultSuperAdmin
  src/routes/auth.ts                          [edit] /me, /update, accept username
  src/modules/users/routes.ts                 [new]  CRUD + status + reset password
  src/modules/users/zones.ts                  [new]  GET /api/zones (seed Zone1..Zone5)
  src/modules/activity/routes.ts              [new]  /api/activity/{login,all,lead}
  src/db/mongo.ts                             [edit] new indexes for users
  src/index.ts                                [edit] register new routes + ensureDefaultSuperAdmin on boot
  scripts/migrate-roles.ts                    [new]
src/
  contracts/roles.ts                          [edit]
  lib/api/client.ts                           [edit] new endpoints
  lib/auth-store.ts                           [new]  zustand authUser
  lib/store.ts                                [edit] add "super_admin" role + zero remaining seeds
  routes/_authenticated.tsx                   [new]  guard
  routes/login.tsx                            [edit] username OR email + /me + redirect-back
  routes/settings.tsx                         [edit] role-aware shell
  components/settings/SuperAdminSettingsPanel.tsx  [new]  ported
  components/settings/UsersTab.tsx            [new]
  components/settings/RolesTab.tsx            [new]
  components/settings/ActivityTab.tsx        [new]
  components/settings/AddUserForm.tsx         [new]
  components/AppShell.tsx                     [edit] super_admin nav + Super Admin in View-as
```

---

## Production hardening (already covered, restating)

- Argon2 password hashing (already in repo).
- JWT in httpOnly cookie + Bearer header; 15m access TTL.
- Rate-limit on `/api/auth/login` (already global; add stricter per-IP cap).
- Server-side scope checks on every user-mgmt and lead-create route.
- Login activity logged to `entity_event` for audit.

---

## Acceptance test (manual, after deploy)

1. Visit `/login` → enter `superadmin@gharpayy.com` / `superadmin#gharpayy` → redirected to home.
2. Sidebar shows "Settings" → opens 4 tabs. Add a new user (role = `member`, zones = Zone1).
3. Logout, log in as that new member → only member-scoped nav shown, Settings shows Profile only.
4. As member, click "Add Lead" → fill form → lead appears in `/myt/leads` and is visible to super admin in real time (Socket.IO).
5. As super admin, Activity tab shows the login + lead.created events.
6. "View as" dropdown bottom-left shows Super Admin / Flow Ops / TCM / HR / Property Owner — switching changes the persona view (dev tool, no auth change).
