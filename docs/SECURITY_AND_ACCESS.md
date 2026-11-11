# Security and Access

Who can reach what in the Toah Nipi booking system, how to check the live configuration, and how to give or remove staff access.

This guide was moved out of the main [README](../README.md) and updated where the repository shows newer behaviour. The most recent full review is [audit/SECURITY_AUDIT_2026-11-10.md](audit/SECURITY_AUDIT_2026-11-10.md). Its section 8 lists live deployment steps that had **not** been carried out when it was written; check that list before changing authentication, the inquiry function or portal hosting.

## Contents

- [Access model](#access-model)
- [Staff roles](#staff-roles)
- [Giving and removing staff access](#giving-and-removing-staff-access)
- [How the guest portal reaches data](#how-the-guest-portal-reaches-data)
- [Storage buckets](#storage-buckets)
- [Database objects and policies](#database-objects-and-policies)
- [Auditing the live configuration](#auditing-the-live-configuration)
- [Public inquiry Edge Function](#public-inquiry-edge-function)
- [Sensitive data](#sensitive-data)
- [Secrets](#secrets)

---

## Access model

- **Staff dashboard (this repository).** Every route sits behind `StaffAuthGate`. Without a Supabase session, only the staff sign-in screen renders. Staff sign in with email and password through Supabase Auth.
- **Row-level security (RLS) is the real authorisation boundary.** The frontend does not enforce every permission itself. The Supabase project URL and publishable key are visible in the browser by design; data is protected by database policies, not by hiding them.
- **Guests do not sign in.** The guest portal is a separate application. It reaches data only through `security definer` database functions and Edge Functions that look up one booking by its portal token.
- **The public inquiry form** posts to the `submit-guest-inquiry` Edge Function, which needs no login.

Supabase Auth has no sign-up screen in the app, but the sign-up API exists regardless of the UI. **Public sign-up must be disabled in the Supabase project settings** (Authentication → Sign In / Providers).

## Staff roles

Access is controlled by `public.staff_profiles`, one row per Auth user, with a role and an `is_active` flag.

| Role | Can do |
|---|---|
| `viewer` | Read allowed data |
| `staff` | Read, plus create and edit bookings |
| `admin` | Everything `staff` can, plus destructive actions such as deleting bookings |

Database helper functions used by policies:

```text
current_staff_role()
is_active_staff()
can_manage_bookings()
is_staff_admin()
```

[supabase/migrations/20261110000100_role_helpers_never_null.sql](../supabase/migrations/20261110000100_role_helpers_never_null.sql) makes these return `false` rather than `NULL` for non-staff, so a check written as `if not helper()` cannot pass by accident. Check whether it has been applied to the live project before relying on it.

### User Admin is not access control

The **User Admin** screen manages the shared `staff_directory` table (names used for task assignment and the per-computer **Working as** choice). It does **not** create Auth accounts, control sign-in, assign database permissions, replace `staff_profiles` or revoke access. When several people use one login, "completed by" comes from the **Working as** choice on each computer.

## Giving and removing staff access

### Add a staff user

1. Create or invite the user in Supabase Auth.
2. Add their row to `staff_profiles` with the right role.
3. Set `is_active = true`.

At least one administrator should exist.

### Remove access

- Set `staff_profiles.is_active = false`. RLS checks this on every request, so it takes effect on the user's next database call.
- Ban the Auth user (Authentication → Users) so they can no longer sign in or refresh a session. Banning is preferred over deleting: an Auth user who reviewed guest inquiries cannot be deleted while `guest_inquiries.reviewed_by` references them.

Signing out in the app only ends the session in that browser. Other devices stay signed in until their session is revoked or the user is banned. Removing someone from User Admin does not revoke anything.

## How the guest portal reaches data

Each booking has a `portal_token`. Its database default is `encode(gen_random_bytes(16), 'hex')`, a 128-bit random value. Portal links have the form:

```text
<VITE_GUEST_PORTAL_BASE_URL>/?portal=<portal_token>
```

**Treat portal links like passwords.** The token is the only credential: anyone with a working link can see and act on that group's portal. Do not publish portal links. Storage paths start with the token, so treat storage paths and signed URLs the same way.

Guest access goes through these `security definer` functions, callable without a staff login:

```text
get_portal_record
portal_get_booking_reference
portal_get_checklist_item_response
portal_mark_checklist_item_ready
portal_unmark_checklist_item_ready
portal_submit_checklist_item_response
portal_submit_checklist_upload
portal_upload_path_is_allowed
```

They are the security boundary for guests. Each must look up the booking from the supplied token and never trust a booking ID, checklist item ID or storage path the guest supplies without checking it belongs to that token. Review them whenever they change.

Where their definitions live:

- `get_portal_record`, with signing fields added, is in [supabase/migrations/20261107000100_portal_signing.sql](../supabase/migrations/20261107000100_portal_signing.sql).
- A read-only copy of the live definitions of all of them, taken on 2026-11-07, is in [audit/ONLINE_SIGNATURE_LIVE_SCHEMA_2026-11-07.sql](audit/ONLINE_SIGNATURE_LIVE_SCHEMA_2026-11-07.sql).

The `portal-sign` and `portal-email` Edge Functions check the portal token, a cron secret, a webhook signature or a staff session themselves, so their gateway JWT check is off in [supabase/config.toml](../supabase/config.toml).

## Storage buckets

### `portal-uploads`

Private bucket for staff and guest portal files. Staff open files through signed URLs that expire after 10 minutes; they are served from the Supabase domain, not the dashboard's.

| Setting | Value |
|---|---|
| Public | No |
| File size limit | 10 MB (10485760 bytes) |
| Allowed MIME types | `application/pdf`, `application/msword`, `.docx`, `application/vnd.ms-excel`, `.xlsx`, `image/png`, `image/jpeg` |

The allow-list excludes HTML and SVG. Guest uploads are allowed only where `portal_upload_path_is_allowed(name)` returns true.

Staff document paths follow:

```text
<portal_token>/staff-documents/<document_id>/<sanitized-file-name>
```

The staff upload picker in [src/pages/PortalAdminView.jsx](../src/pages/PortalAdminView.jsx) also offers HEIC and TXT, but the bucket rejects those types, so those uploads fail. Either add `image/heic` and `text/plain` to the bucket or remove them from `PORTAL_STAFF_DOCUMENT_MIME_BY_EXTENSION`.

Guest uploads can still be harmful documents (for example, Office files with macros). Open guest Office files in Protected View and never enable macros.

Deleting a booking does **not** delete its files in Storage.

### `portal-signed`

Private bucket used by online signing (built, off by default). It holds the exact original and the signed copy of each signed document. See [portal-signing/SETUP.md](portal-signing/SETUP.md).

## Database objects and policies

RLS must be enabled on every public table. Every policy for the `authenticated` role must call `is_active_staff()`, `can_manage_bookings()` or `is_staff_admin()`. **"Signed in" is not the same as "staff"**: a policy whose condition is just `true` gives access to any Auth user.

Anonymous users must have no `SELECT`, `INSERT`, `UPDATE` or `DELETE` privileges on the booking, inquiry or portal tables.

Production foreign keys and their delete behaviour:

| Table → referenced table | On delete |
|---|---|
| `portal_checklist_items` → `bookings` | Cascade (portal tasks are deleted with the booking) |
| `portal_documents` → `bookings` | Cascade (portal document rows are deleted with the booking) |
| `guest_inquiries` → `bookings` | Set null (the inquiry remains; its converted-booking link is cleared) |
| `guest_inquiries` → `auth.users` | No action (an Auth user who reviewed inquiries cannot be deleted while those rows reference them) |
| `staff_profiles` → `auth.users` | Cascade |

Not every production object is defined in this repository. `src/docs/SQL_SETUP.md` covers the core tables, and `supabase/migrations/` covers later additions, but the table definitions of `guest_inquiries`, `portal_checklist_items` and `portal_documents`, and the `portal-uploads` bucket and its policies, are not in this repository. Do not assume a clone recreates every production object.

## Auditing the live configuration

Most security configuration lives in the Supabase project, not in this repository. Run these read-only queries in the SQL Editor after any schema, policy or function change:

```sql
-- RLS enabled on every public table
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by 1;

-- Every table and Storage policy
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname in ('public', 'storage') order by 1, 2, 3;

-- Table privileges for anon / authenticated
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by 1, 2 order by 1, 2;

-- Functions callable by anon / authenticated
select p.proname, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by 1;

-- Bucket settings
select id, public, file_size_limit, allowed_mime_types from storage.buckets;

-- Auth users with no staff profile (should normally be none)
select u.email, u.created_at, u.last_sign_in_at
from auth.users u left join public.staff_profiles s on s.user_id = u.id
where s.user_id is null order by u.created_at desc;
```

What to look for:

- RLS is `true` on every table.
- No `authenticated` policy uses a bare `true` condition or only checks for a signed-in user.
- No Storage policy grants `authenticated` access to a whole bucket without a staff-role check.
- `anon` has no `SELECT`, `INSERT`, `UPDATE` or `DELETE` privileges.
- Only the intended portal functions are callable by `anon`.
- Buckets are private, with the expected size and MIME limits.
- No unexpected Auth users exist.

Also confirm in the Supabase dashboard (Authentication) that public sign-ups are disabled.

## Public inquiry Edge Function

`submit-guest-inquiry` is intentionally callable without a staff login. Because it is public it must:

- Validate every accepted field, and never insert the raw request body.
- Avoid exposing privileged database behaviour through user-controlled values.
- Be monitored for spam and abuse, with rate limiting or bot protection added if abuse appears.

The security audit found the deployed copy older than the one in this repository; see its section 8 before deploying.

## Sensitive data

Booking data can include names, email addresses, phone numbers, food allergy information, operational notes, financial fields and retreat details. Treat spreadsheet exports, CSV files, manual JSON backups and the Google Drive backups as sensitive. Do not put backup files in publicly shared folders.

## Secrets

Every variable starting with `VITE_` is compiled into the browser bundle. Never put any of these in a `VITE_` variable:

- Supabase secret or service-role key
- Database password or `DATABASE_URL`
- Google credentials
- Private API tokens or other server-side secrets

A service-role or secret key bypasses RLS and must never reach the browser. Edge Function secrets are set with `supabase secrets set`; the email system's are listed in [portal-email/SETUP.md](portal-email/SETUP.md). The Google Apps Script backup credentials are described in [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md#automatic-backup-configuration).

If a secret is committed by mistake:

1. Remove it from the repository.
2. Rotate the credential.
3. Update the environment that uses it.
4. Redeploy if necessary.
