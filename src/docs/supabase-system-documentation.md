# Toah Nipi Booking Dashboard: Supabase System Documentation

**Document status:** Internal technical documentation
**System:** Toah Nipi Staff Dashboard / Booking Management
**Database provider:** Supabase
**Database type:** Managed PostgreSQL
**Current project name:** XXXRedactedXXX
**Last updated:** June 14, 2026
**Owner / maintainer:** Paymvi

---

## 1. Purpose of This Document

This document explains the new Supabase-backed booking system used by the Toah Nipi staff dashboard.

It covers:

* Where booking data is stored
* How the dashboard connects to Supabase
* Which users can access booking data
* What permissions each staff role has
* What data still uses local browser storage
* What must be true before importing real booking data
* How to test that the system is secure

This document is intended for developers, project maintainers, and trusted staff who need to understand how the new system works.

---

## 2. System Summary

The Toah Nipi staff dashboard previously relied heavily on browser `localStorage` and spreadsheet imports.

The new system stores booking records in Supabase instead of relying on browser-only storage.

Supabase provides:

* A hosted PostgreSQL database
* A browser-accessible API
* Authentication for staff login
* Row Level Security policies to protect data
* A managed backend so the team does not need to run its own server

The dashboard is still a React frontend app, but booking data now comes from the Supabase `bookings` table.

---

## 3. Plain-English System Diagram

```txt
Staff member
  ↓
React dashboard
  ↓
Supabase login session
  ↓
Supabase Row Level Security
  ↓
bookings table
```

The important security idea is:

```txt
The frontend app is not the real security boundary.
The database policies are the real security boundary.
```

Even if someone finds the public Supabase project URL and publishable key, they should not be able to read or change booking data unless they are an approved staff user.

---

## 4. Supabase Project Information

| Item                    | Value                                                                         |
| ----------------------- | ----------------------------------------------------------------------------- |
| Supabase project name   | `toah-nipi-booking`                                                           |
| Region                  | Americas, exact cloud region should be confirmed in Supabase project settings |
| Database                | PostgreSQL                                                                    |
| Main booking table      | `public.bookings`                                                             |
| Staff permission table  | `public.staff_profiles`                                                       |
| Authentication system   | Supabase Auth                                                                 |
| Frontend framework      | React / Vite                                                                  |
| Frontend key type       | Supabase publishable key                                                      |
| Secret key in frontend? | No, never allowed                                                             |

---

## 5. Important Security Rule About Keys

The React frontend uses a Supabase publishable key.

That key is allowed to exist in the frontend, but it is not enough to secure the database by itself.

The publishable key should be treated like a public app identifier, not like a password.

The following keys must never be placed in frontend React code:

* Supabase service-role key
* Supabase secret key
* Database password
* Any private server key
* Any key that bypasses Row Level Security

The frontend may use:

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

The frontend must never use:

```txt
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_SECRET_KEY
DATABASE_URL
POSTGRES_PASSWORD
```

---

## 6. Environment Variables

The frontend uses a `.env.local` file during development.

Example:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Rules:

1. `.env.local` must not be committed to GitHub.
2. `.env.local` should be listed in `.gitignore`.
3. The publishable key is not a true secret, but it should still not be casually shared.
4. Secret/service-role keys must never be used in the frontend.
5. If keys are ever accidentally committed, rotate them in Supabase.

---

## 7. Database Tables

### 7.1 `bookings`

The `bookings` table is the main source of truth for booking, inquiry, waitlist, master spreadsheet, and archive-style booking records.

The dashboard reads from and writes to this table.

Examples of fields stored in `bookings` include:

* Organization name
* Contact name
* Email
* Phone
* Start date
* End date
* Desired dates
* Attendee count
* Retreat type
* Room/building information
* Meals
* Food allergies
* Notes
* Waitlist status
* Booking status
* Imported spreadsheet metadata
* Archive fields
* Program logistics assignments
* Checklist data
* Raw imported spreadsheet data

The dashboard should treat Supabase as the main booking data source.

Browser localStorage should no longer be treated as the main booking database.

---

### 7.2 `staff_profiles`

The `staff_profiles` table is the backend permission list for staff members.

It connects a Supabase Auth user to an internal staff role.

Example fields:

| Field        | Meaning                                                    |
| ------------ | ---------------------------------------------------------- |
| `user_id`    | The Supabase Auth user ID                                  |
| `email`      | Staff email address                                        |
| `full_name`  | Staff member name                                          |
| `role`       | Permission level                                           |
| `is_active`  | Whether the user is currently allowed to access the system |
| `created_at` | When the staff profile was created                         |
| `updated_at` | When the staff profile was last changed                    |

A person being logged in is not enough.

They also need an active row in `staff_profiles`.

---

## 8. Authentication Model

The dashboard uses Supabase Auth for staff login.

The intended login flow is:

```txt
1. Staff member opens dashboard.
2. App checks for an active Supabase session.
3. If no session exists, the staff login screen appears.
4. Staff member signs in with email and password.
5. Supabase creates a browser session.
6. Dashboard loads.
7. Database policies check whether the user is active staff.
```

Public signup should be disabled.

That means random users should not be able to create their own accounts.

Staff accounts should be created or invited manually by an admin.

---

## 9. Permission Roles

The system uses three staff roles:

| Role     | Purpose                                          |
| -------- | ------------------------------------------------ |
| `viewer` | Can view booking data but cannot change it       |
| `staff`  | Can view, import, add, and edit bookings         |
| `admin`  | Can view, import, add, edit, and delete bookings |

Recommended use:

| Staff type                                | Recommended role |
| ----------------------------------------- | ---------------- |
| Person who only needs to look up bookings | `viewer`         |
| Office/program staff who manage bookings  | `staff`          |
| Trusted system manager or lead admin      | `admin`          |

---

## 10. Permission Matrix

| User type                             | Can open dashboard? | Can see bookings? | Can add/import bookings? | Can edit bookings? | Can delete bookings? |
| ------------------------------------- | ------------------: | ----------------: | -----------------------: | -----------------: | -------------------: |
| Not logged in                         |                  No |                No |                       No |                 No |                   No |
| Logged in but not in `staff_profiles` |    No useful access |                No |                       No |                 No |                   No |
| Inactive staff profile                |    No useful access |                No |                       No |                 No |                   No |
| `viewer`                              |                 Yes |               Yes |                       No |                 No |                   No |
| `staff`                               |                 Yes |               Yes |                      Yes |                Yes |                   No |
| `admin`                               |                 Yes |               Yes |                      Yes |                Yes |                  Yes |
| Supabase project owner                |                 Yes |               Yes |                      Yes |                Yes |                  Yes |

---

## 11. Row Level Security

Row Level Security, or RLS, is the database-level permission system.

RLS is enabled on sensitive tables.

The purpose of RLS is to make sure that even if someone directly calls the Supabase API, the database still checks whether they are allowed to access the data.

The most important tables with RLS are:

```txt
public.bookings
public.staff_profiles
```

The old temporary development policies allowed anonymous users to read, insert, update, and delete fake booking data.

Those temporary policies must be removed before real data is imported.

---

## 12. Old Development Policies

During early development, temporary policies were created so the React app could test Supabase without staff login.

These policies had names similar to:

```txt
TEMP DEV allow anon select bookings
TEMP DEV allow anon insert bookings
TEMP DEV allow anon update bookings
TEMP DEV allow anon delete bookings
```

Those policies allowed anonymous access to the `bookings` table.

That was acceptable only for fake/test data.

Those policies are not acceptable for real booking data.

Before importing real data, confirm that all `TEMP DEV allow anon...` policies have been removed.

---

## 13. Final Booking Policies

The intended secure booking policy model is:

| Action          | Allowed users                   |
| --------------- | ------------------------------- |
| Read bookings   | Active staff users              |
| Insert bookings | Active `staff` or `admin` users |
| Update bookings | Active `staff` or `admin` users |
| Delete bookings | Active `admin` users only       |

Plain-English version:

```txt
Viewers can look.
Staff can work.
Admins can delete.
Anonymous users get nothing.
```

---

## 14. Staff Profile Policies

The intended `staff_profiles` policy model is:

| Action                    | Allowed users                                                    |
| ------------------------- | ---------------------------------------------------------------- |
| Read own profile          | The logged-in staff member                                       |
| Read all staff profiles   | Admins                                                           |
| Update staff profiles     | Admins                                                           |
| Insert new staff profiles | Preferably handled manually in Supabase or by an admin-only tool |
| Delete staff profiles     | Prefer disabling with `is_active = false` instead of deleting    |

Recommended practice:

Do not delete old staff profiles unless necessary.

Instead, set:

```txt
is_active = false
```

This preserves history and prevents accidental re-access.

---

## 15. LocalStorage Status

The new booking system uses Supabase for booking records.

However, some non-critical dashboard data may still use browser `localStorage`.

Examples may include:

* Sidebar collapsed state
* Dashboard filter preferences
* Date display settings
* Current local UI settings
* Legacy staff UI state
* Temporary frontend-only settings

Important distinction:

```txt
Supabase = source of truth for booking data
localStorage = browser convenience storage for UI preferences and legacy frontend state
```

Browser localStorage is not secure enough for real booking data.

Real booking, inquiry, and contact data should live in Supabase with RLS enabled.

---

## 16. Dashboard Data Flow

### Loading bookings

```txt
Dashboard opens
  ↓
StaffAuthGate checks Supabase session
  ↓
If logged in, Dashboard renders
  ↓
Dashboard calls fetchBookings()
  ↓
fetchBookings() queries Supabase bookings table
  ↓
Supabase RLS checks user permission
  ↓
Allowed rows are returned
```

### Importing bookings

```txt
Staff imports spreadsheet
  ↓
Dashboard normalizes spreadsheet rows
  ↓
bookingService converts frontend fields to database fields
  ↓
upsertBookings() saves rows into Supabase
  ↓
Supabase RLS checks insert permission
  ↓
Dashboard refreshes state
```

### Editing bookings

```txt
Staff edits booking
  ↓
Dashboard calls upsertBooking()
  ↓
Supabase updates matching booking row
  ↓
Supabase RLS checks update permission
  ↓
Dashboard updates local screen state
```

### Deleting bookings

```txt
Admin clicks delete
  ↓
Dashboard calls deleteAllBookings() or delete action
  ↓
Supabase RLS checks admin permission
  ↓
Delete succeeds only for admin users
```

---

## 17. Main Frontend Files

The exact file structure may change over time, but the important frontend pieces are:

| File                                    | Purpose                                        |
| --------------------------------------- | ---------------------------------------------- |
| `src/lib/supabaseClient.js`             | Creates the Supabase browser client            |
| `src/services/bookingService.js`        | Converts booking objects and talks to Supabase |
| `src/pages/Dashboard.jsx`               | Main staff dashboard UI                        |
| `src/pages/StaffLogin.jsx`              | Staff login form                               |
| `src/auth/StaffAuthGate.jsx`            | Blocks dashboard unless user is logged in      |
| `src/components/StaffSignOutButton.jsx` | Lets staff sign out                            |

---

## 18. Main Supabase Functions

The database uses helper functions to keep policies readable.

| Function                | Plain meaning                                     |
| ----------------------- | ------------------------------------------------- |
| `current_staff_role()`  | Gets the logged-in user’s active staff role       |
| `is_active_staff()`     | Checks whether the logged-in user is active staff |
| `can_manage_bookings()` | Checks whether the user is `staff` or `admin`     |
| `is_staff_admin()`      | Checks whether the user is an `admin`             |

These functions are used by RLS policies.

They make the policy logic easier to understand and maintain.

---

## 19. Required Security Settings Before Real Data

Before importing real data, confirm the following:

| Requirement                           | Required status |
| ------------------------------------- | --------------- |
| Temporary anon booking policies       | Deleted         |
| `anon` booking grants                 | Revoked         |
| RLS on `bookings`                     | Enabled         |
| RLS on `staff_profiles`               | Enabled         |
| Public signup                         | Disabled        |
| Anonymous sign-ins                    | Disabled        |
| Staff login page                      | Implemented     |
| Dashboard auth gate                   | Implemented     |
| Staff users created in Supabase Auth  | Yes             |
| Staff users added to `staff_profiles` | Yes             |
| Incognito users blocked               | Yes             |
| Logged-in inactive users blocked      | Yes             |
| Service-role key in frontend          | No              |
| Secret key in frontend                | No              |
| `.env.local` committed                | No              |

Real data should not be imported until every item above is confirmed.

---

## 20. Testing Checklist

### Test 1: Logged out user

Steps:

1. Open an incognito/private browser window.
2. Go to the dashboard URL.
3. Do not log in.

Expected result:

```txt
User sees the staff login page.
User cannot see booking data.
```

---

### Test 2: Valid staff login

Steps:

1. Go to the dashboard.
2. Log in with a valid staff account.
3. Confirm that the staff profile exists and `is_active = true`.

Expected result:

```txt
Dashboard opens.
Booking data loads from Supabase.
```

---

### Test 3: User not in staff_profiles

Steps:

1. Create or use a Supabase Auth user.
2. Do not add that user to `staff_profiles`.
3. Try to access bookings.

Expected result:

```txt
User may be logged in, but booking queries are blocked.
```

---

### Test 4: Inactive staff user

Steps:

1. Set a staff profile to inactive:

```sql
update public.staff_profiles
set is_active = false
where email = 'example@example.com';
```

2. Log in as that user.
3. Try to load dashboard data.

Expected result:

```txt
User cannot access bookings.
```

Restore access by setting:

```sql
update public.staff_profiles
set is_active = true
where email = 'example@example.com';
```

---

### Test 5: Viewer cannot edit

Steps:

1. Give a test user the role `viewer`.
2. Log in as that user.
3. Try to edit or import bookings.

Expected result:

```txt
User can read bookings but cannot insert or update booking data.
```

---

### Test 6: Staff cannot delete

Steps:

1. Give a test user the role `staff`.
2. Log in as that user.
3. Try to delete booking rows.

Expected result:

```txt
User can read, insert, and update bookings.
User cannot delete bookings.
```

---

### Test 7: Admin can delete

Steps:

1. Give a trusted test user the role `admin`.
2. Log in as that user.
3. Try to delete fake test booking data.

Expected result:

```txt
Delete succeeds.
```

Only run this test with fake data.

---

## 21. Real Data Import Procedure

Before importing real data:

1. Commit the working code.
2. Confirm that fake data import works.
3. Confirm that anonymous users are blocked.
4. Confirm that staff login works.
5. Confirm that RLS policies are active.
6. Confirm that only approved staff users can access bookings.
7. Delete fake data from the `bookings` table.
8. Import real data through the dashboard.
9. Confirm rows appear in Supabase.
10. Refresh the dashboard and confirm data persists.
11. Confirm old localStorage booking data is not being used.

Recommended SQL to clear fake bookings before real import:

```sql
delete from public.bookings;
```

Only run this when you are certain the table contains fake/test data.

---

## 22. What To Do When Adding a New Staff Member

Recommended process:

1. Create or invite the user in Supabase Auth.
2. Copy their Supabase Auth user ID.
3. Insert a row in `public.staff_profiles`.
4. Choose the correct role: `viewer`, `staff`, or `admin`.
5. Set `is_active = true`.
6. Have the user log in.
7. Confirm they can only do what their role allows.

Example staff profile insert:

```sql
insert into public.staff_profiles (
  user_id,
  email,
  full_name,
  role,
  is_active
)
values (
  'AUTH-USER-ID-HERE',
  'staff@example.com',
  'Staff Name',
  'staff',
  true
);
```

---

## 23. What To Do When Removing a Staff Member

Do not rely only on removing frontend access.

Disable the staff profile in Supabase:

```sql
update public.staff_profiles
set is_active = false
where email = 'staff@example.com';
```

Recommended additional steps:

1. Disable or delete the user in Supabase Auth.
2. Rotate passwords if needed.
3. Review whether the person had admin access.
4. Check recent activity if something seems suspicious.

---

## 24. What To Do If a Key Is Accidentally Committed

If `.env.local` or any Supabase key is accidentally committed:

1. Remove the key from the code.
2. Add `.env.local` to `.gitignore`.
3. Rotate the exposed key in Supabase.
4. Rebuild/redeploy the app with the new key.
5. Check Supabase logs for unusual activity.
6. Confirm RLS policies are still active.

If a service-role or secret key was exposed, treat it as serious.

A service-role or secret key can bypass normal frontend security and should be rotated immediately.

---

## 25. What To Do If Real Data Was Imported Too Early

If real data was imported while anonymous access was still enabled:

1. Remove the temporary anonymous policies immediately.
2. Revoke anonymous access from the `bookings` table.
3. Confirm RLS is enabled.
4. Check Supabase logs if available.
5. Rotate frontend publishable keys if desired.
6. Notify the project owner.
7. Decide whether any contacts/staff need to be informed.
8. Do not continue importing real data until security is confirmed.

---

## 26. Backup and Recovery Notes

The old dashboard had frontend/localStorage-style backup behavior.

The new Supabase-backed system should eventually use a real database backup/export process.

Recommended future backup options:

* Supabase database backups
* Scheduled Postgres exports
* Admin-only CSV exports
* Versioned spreadsheet exports
* Periodic manual backup before major imports

Important:

```txt
Browser localStorage backups are not a full database backup strategy.
```

---

## 27. Known Current Limitations

The system is still evolving.

Known limitations may include:

* Some UI settings may still use browser localStorage.
* Staff management may still require manual Supabase SQL changes.
* The portal may not yet be fully connected to Supabase.
* File/document uploads may not yet be secured through Supabase Storage.
* More detailed audit logging may still need to be added.
* Multi-factor authentication may still need to be enabled.
* Role-specific frontend UI restrictions may need improvement.

The database RLS policies are more important than frontend button hiding.

Frontend UI should be helpful, but database policies must remain the final authority.

---

## 28. Recommended Future Improvements

Recommended improvements after real-data launch:

1. Add a staff management screen for admins.
2. Add multi-factor authentication for admin users.
3. Add audit logging for major booking changes.
4. Add per-booking change history.
5. Add safer delete behavior, such as archive instead of hard delete.
6. Add Supabase Storage policies for uploaded documents.
7. Add automated database backups.
8. Add role-specific UI hiding.
9. Add password reset documentation for staff.
10. Add production deployment checklist.

---

## 29. Security Summary

The secure system should follow this rule:

```txt
No staff login = no booking data.
Logged in but not approved = no booking data.
Approved viewer = read only.
Approved staff = read, add, edit.
Approved admin = read, add, edit, delete.
```

The frontend key is not the real protection.

The real protection is:

```txt
Supabase Auth + staff_profiles + Row Level Security
```

This allows the dashboard to safely use Supabase from the browser while still protecting booking data from anonymous users and unauthorized accounts.

---

## 30. Final Pre-Launch Approval Checklist

Before real Toah Nipi data is imported, a maintainer should confirm:

```txt
[ ] Fake test data has been cleared.
[ ] TEMP DEV anon policies are deleted.
[ ] anon table access has been revoked.
[ ] RLS is enabled on bookings.
[ ] RLS is enabled on staff_profiles.
[ ] Staff login is implemented.
[ ] Dashboard is wrapped in StaffAuthGate.
[ ] Public signup is disabled.
[ ] Anonymous sign-ins are disabled.
[ ] At least one admin user exists.
[ ] Staff users exist in Supabase Auth.
[ ] Staff users exist in staff_profiles.
[ ] Incognito browser cannot see bookings.
[ ] Logged-in inactive staff cannot see bookings.
[ ] Viewer role cannot edit bookings.
[ ] Staff role cannot delete bookings.
[ ] Admin role can delete fake test bookings.
[ ] No service-role or secret key exists in frontend code.
[ ] .env.local is not committed.
[ ] Real data import has been approved.
```

Only after this checklist passes should real booking data be imported.
