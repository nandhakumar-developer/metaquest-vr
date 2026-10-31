# Optional Supabase integration

The gateway is fully functional without Supabase. Supabase adds two optional capabilities:

1. **Admin sign-in through Supabase Auth**, with a role resolved from a `profiles` table.
2. **Metadata synchronization** of devices, videos, sessions, commands, and logs to
   Supabase tables when the internet is available.

Live playback, pairing, and media streaming never depend on Supabase.

## Current configuration

`.env` contains the supplied browser-safe project values:

```dotenv
VITE_SUPABASE_URL=https://jlmvpzugvwwglpkqtcly.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_wXb9MCrLiSXMlSdpA38RGQ_SZSuWeel
SUPABASE_URL=https://jlmvpzugvwwglpkqtcly.supabase.co
SUPABASE_ANON_KEY=sb_publishable_wXb9MCrLiSXMlSdpA38RGQ_SZSuWeel
SUPABASE_SERVICE_ROLE_KEY=
CLOUD_SYNC_ENABLED=false
```

Because `SUPABASE_SERVICE_ROLE_KEY` is empty:

- the gateway cannot query `profiles` with service-role privileges,
- `roleVerification` is false in `GET /api/config`,
- the admin login page keeps the **Supabase** tab hidden,
- cloud sync is disabled,
- local administrator sign-in works normally.

No Supabase users or profiles were created for you. Use the local account or complete the
steps below.

## Why a service-role key is required

Any browser can call Supabase Auth and obtain an access token. The gateway must then decide
whether that account is an authorized VR Control Center administrator. It does this by
looking up the user's role in `profiles`. That lookup uses the service-role key so row-level
security cannot hide the role from the verification query and so the role cannot be forged
by a client. The key stays on the gateway and is never sent to the admin bundle or headset.

## Setup

### 1. Create the profiles table

Run this in the Supabase SQL editor:

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'viewer'
    check (role in ('admin', 'operator', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users may read their own profile. The gateway uses the service role and
-- bypasses RLS for role verification.
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);
```

Do not add a public insert/update policy that lets users choose their own role.

### 2. Create users and assign roles

Create users in **Authentication → Users** (or let them sign up, then disable public
sign-ups). Insert a profile for each administrator:

```sql
insert into public.profiles (id, display_name, role)
values ('<auth-user-uuid>', 'VRCC Administrator', 'admin')
on conflict (id) do update
  set display_name = excluded.display_name,
      role = excluded.role,
      updated_at = now();
```

Roles:

- `admin`: full access
- `operator`: can control devices and start playback, but not viewer-only restrictions
- `viewer`: read-only dashboard access

### 3. Add the server-only key

In `.env` on the gateway PC:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

Restart the gateway. `GET /api/config` should now report:

```json
{
  "auth": {
    "supabase": {
      "url": "https://jlmvpzugvwwglpkqtcly.supabase.co",
      "anonKey": "sb_publishable_…",
      "roleVerification": true
    }
  }
}
```

The login page now shows **Local admin / Supabase**. Supabase sign-in uses
`signInWithPassword` in the browser, then sends the access token to
`POST /api/auth/supabase`. The gateway verifies the token and resolves the role.

Never commit the service-role key, put it in `VITE_*` variables, or expose it to the player.

## Optional metadata sync

To enable the sync worker:

```dotenv
CLOUD_SYNC_ENABLED=true
```

Create the tables the worker expects, matching the local metadata:

- `devices`
- `videos`
- `playback_sessions`
- `device_commands`
- `device_logs`
- `device_videos` (composite key `device_id,video_id`)

The worker retries a durable local outbox and never blocks live commands. It synchronizes
metadata only; the browser player keeps streaming media from the local gateway. The
`supabase` storage adapter exists for future media mirroring but is not used by the current
browser-player flow.

Check sync state in the dashboard header/cloud status or `GET /api/health` (`cloud` object).

## Security notes

- Keep RLS enabled on `profiles`.
- Do not grant anon/authenticated users write access to `profiles.role`.
- Rotate the service-role key if it is ever exposed.
- The publishable key is safe in the browser; the service-role key is not.
- Local admin auth continues to work if Supabase is unreachable.
