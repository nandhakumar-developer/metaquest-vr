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

The project URL and publishable key enable Supabase Auth. Enter the Supabase user's email
and password in the login form; do not store a user's credentials in `.env`.

The service-role key is optional for login and is only used by privileged server-side
integrations such as cloud metadata sync.

Without a service-role key:

- cloud sync is disabled,
- Supabase login still works when `profiles` has the own-row RLS policy below.

No Supabase users or profiles were created for you. Create a user and profile as below.

## Profile role verification

After Supabase Auth verifies the password, the gateway verifies the access token with
Supabase and reads only that user's `profiles` row using the same token. Row-level security
limits the query to `auth.uid() = profiles.id`; users cannot change their own role.

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
grant select on public.profiles to authenticated;

-- Users may read their own role; the gateway performs this query with their JWT.
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

### 3. Configure the gateway

Keep the project URL and publishable/anon key in `.env` on the gateway PC:

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-publishable-key>
```

Do not put the Supabase user's email or password in `.env`. Restart the gateway.
`GET /api/config` should report a non-null Supabase auth config when the URL and key are
valid:

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

The login page shows **Local admin / Supabase**. Supabase sign-in uses
`signInWithPassword` in the browser, then sends the access token to
`POST /api/auth/supabase`. The gateway verifies the token and reads the caller's role under
RLS. The `profiles` table must be exposed through the Data API; if it is not, expose `public`
in the project's Data API settings. Keep RLS enabled and grant only the required `SELECT`.

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
- The publishable key is safe in the browser; service-role keys are not.
- Never let users update their own `profiles.role`; assign roles through trusted administration.
- Local admin auth continues to work if Supabase is unreachable.
