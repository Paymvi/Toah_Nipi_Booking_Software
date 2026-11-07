# Online Signing: Decision and Implementation Plan

**Status: plan for review only. Nothing described here is built, enabled, purchased or sent.** Prepared 2026-11-07 from your answers in [ONLINE_SIGNATURE_AUDIT_AND_QUESTIONS.md](ONLINE_SIGNATURE_AUDIT_AND_QUESTIONS.md) (E-1 to E-15). That audit is kept unchanged as history; where this plan corrects it, the correction is listed in [section 4](#4-verified-findings-corrections-and-access-limits).

**Not legal advice.** This plan says what the software would do and which questions remain for Toah Nipi's lawyer, insurer and staff. It does not say any document is enforceable.

Evidence labels: **Verified** (read today in code, the live database catalog, a PDF or an official page), **Documented** (stated in a README or doc only), **Inferred** (a conclusion from verified facts), **Unknown** (could not be checked).

## Contents

1. [Recommendation](#1-recommendation)
2. [Requirements and remaining decisions](#2-requirements-and-remaining-decisions)
3. [Custom, provider or self-hosted](#3-custom-provider-or-self-hosted)
4. [Verified findings, corrections and access limits](#4-verified-findings-corrections-and-access-limits)
5. [Staff and guest experience](#5-staff-and-guest-experience)
6. [States: signing progress versus task review](#6-states-signing-progress-versus-task-review)
7. [Data, storage, server and UI changes](#7-data-storage-server-and-ui-changes)
8. [Preparing the actual documents](#8-preparing-the-actual-documents)
9. [Verification, consent, access, downloads, countersigning](#9-verification-consent-access-downloads-countersigning)
10. [Versions, concurrency, retries and recovery](#10-versions-concurrency-retries-and-recovery)
11. [Backups and restore verification](#11-backups-and-restore-verification)
12. [Migration and compatibility](#12-migration-and-compatibility)
13. [Development phases and acceptance checks](#13-development-phases-and-acceptance-checks)
14. [Decisions you still need to make](#14-decisions-you-still-need-to-make)
15. [Checklist before real guest signing](#15-checklist-before-real-guest-signing)
16. [Sources](#16-sources)

---

## 1. Recommendation

**Build the signing into our own portal and Supabase project (the custom option). Keep the design swappable, so the contract alone can move to a managed provider later if the lawyer or insurer asks for that.**

Why:

- **It matches your stated preference.** Guests never leave the portal or see another company's screen, and there are no new subscription or per-document fees at today's volume.
- **The documents are simple.** Each policy form has one signer and a name, signature and date. The contract has one guest signer plus a possible Toah Nipi countersignature. Nothing needs bulk sending, complex routing or fillable forms.
- **Volume is low.** About 180 to 250 real bookings a year. Even with separate requests per document, that's well under 1,000 signing requests a year.
- **Most of the supporting system already exists:**
  - Supabase Edge Functions;
  - a private Storage bucket;
  - a guarded email pipeline with test-mode allowlists and duplicate protection (`dedupe_key`);
  - RLS (row-level security) helper functions;
  - a test harness that runs our SQL locally (pglite).
- **A provider would not remove most of the work.** Even with BoldSign or Documenso we would still build:
  - the signer model and staff screens;
  - the link to portal tasks;
  - a protected copy of every completed file;
  - backups and restore checks;
  - webhook checks.

  The provider replaces only the signing screen, the PDF stamping and the emailed code.

The custom option has real costs, and they are **not zero**:

- developer time to build it and to keep it working;
- possibly a Supabase plan upgrade for backups (section 3.4);
- the fact that Toah Nipi itself holds the evidence. A provider would hold an independent copy.

Section 3 compares all three approaches. The fallback, if you'd rather not maintain signing code, is **BoldSign's Enterprise API** ($30/month listed, embedded signing and emailed codes included). **Documenso Teams** ($40/month) is the alternative. **Self-hosting doesn't fit** today's setup: there is no server to run it on.

**What I need from you:** choose **custom**, **BoldSign** or **Documenso** (decision D-1 in section 14).

---

## 2. Requirements and remaining decisions

### 2.1 Confirmed by your answers (these are the requirements)

| # | Requirement | From |
| --- | --- | --- |
| R-1 | Version 1 covers the **rental contract and policy acknowledgments only**. Individual liability releases, roster matching and parent/guardian signing are out of scope. The current leader confirmations (`liability-release-sent`, `-completed`) stay as they are. | E-1, E-6 |
| R-2 | Prefer signing **inside our portal** with **minimal ongoing cost**. No provider purchase or integration until you choose. | E-2, E-3 |
| R-3 | The signer defaults to the booking contact. **Staff must confirm or change the signer before sending.** Capture name and email, plus organization and title when signing for a group. The signer **confirms authority** to sign for the organization. | E-4 |
| R-4 | Guests may **ask** for a different signer but cannot reassign one. Staff confirm the change and issue a **new** request. | E-4 |
| R-5 | A Toah Nipi countersignature is **optional per request**, by a **named** signer with **separately verified access** and a recorded order. The shared login and "Working as" never authorize it. **No stored signature is applied automatically.** | E-5 |
| R-6 | Signing needs verification through the **designated signer's email** (a short-lived, single-use code or a secure link). The portal link alone is never enough. No SMS or ID checks in version 1. The screen must say that email checks show control of an inbox, not identity or authority. | E-7 |
| R-7 | **Paper and electronic both stay available, set by staff per document.** Paper uploads are labeled differently and still need staff review. Switching methods blocks conflicting active requests and **never deletes earlier evidence**. | E-8 |
| R-8 | **Typed signature by default, drawing optional.** Both need an explicit final "Sign" action after review and name confirmation. If drawing costs too much, ship typed first and say so. | E-9 |
| R-9 | IV clean-up task: prefer "Read and acknowledge …" with a confirm action, **after staff confirm** that no signature is intended. Keep the task's history and explain the migration. | E-10 |
| R-10 | **No automatic replacement requests.** A new version is separate and never inherits a signature. Staff are warned and decide. An earlier agreement is **not** described as invalidated by an upload. | E-11 |
| R-11 | No automatic deletion during development and pilot. Ordinary staff cannot edit or delete completed records. Plan for an approved retention period, legal holds and a logged deletion process. Booking deletion and restores must not silently remove signing records. **Back up the files themselves and test restores.** | E-12 |
| R-12 | The signer can **decline or contact staff** without giving a reason. **Request expiry is separate from the task's due date.** Codes and sessions expire, and the signer can get fresh access while the request is active. Staff can set an expiry, void, or reissue. Neither expiry nor decline cancels the booking. | E-13 |
| R-13 | Signing status shows in Portal Admin and on the task. **No automatic change** to booking status or the contract-returned date. Show **guest signed, awaiting countersignature, fully signed, staff reviewed** as separate states. When fully signed **and** the completed file and evidence are stored, the task moves to **Needs Review**. Staff then confirm through the existing review. Requesting corrections never erases the signed record. | E-14 |
| R-14 | Each signer gets an **immediate download** and **continued access through a verified route**. One completion email per signer **after all signatures**, with a **secure link rather than an attachment**. No paid account is needed. Expired links can be refreshed after verification. The shared portal token is never the only way in. **No duplicate emails.** Development email goes only to chosen test recipients. | E-15 |

### 2.2 Choices still open (see section 14)

| # | Choice |
| --- | --- |
| C-1 | Approach: custom, BoldSign or Documenso (D-1). |
| C-2 | Supabase plan and where off-site file backups live (D-2). |
| C-3 | Approval to run the small Phase 0 fixes, each as its own change (D-3). |
| C-4 | When retention, the contract layout and the countersigner are known, the related settings. These are filled in later, not designed now. |

### 2.3 Facts still to verify

| # | Fact | How |
| --- | --- | --- |
| V-1 | The **actual general and IV contract templates**: pages, signature blocks, whether Toah Nipi signs. **Not found** (section 4.4). | Staff supply the current template files. |
| V-2 | Whether guests can currently open **staff-uploaded documents** (such as the contract) in the portal. The live storage policies suggest they cannot (section 4.2, F-4). | Test with a fictional booking. |
| V-3 | The current Supabase plan (Free or Pro). The CLI listing does not show it. | Supabase dashboard, Billing. |
| V-4 | Whether `pdf-lib` stamping fits Edge Function limits for the largest real contract. | Phase 1 spike with a sample of similar size. |
| V-5 | Peak monthly volume (season) and whether contract and acknowledgments go out together. | Staff; booking dates after one season of use. |
| V-6 | Whether Personal Retreat and Guest House bookings get a contract. | Staff. |
| V-7 | Only if a provider is chosen: plan details marked **Unknown** in section 3.3. | Vendor sales or docs. |

### 2.4 Professional or organizational review before real use (unanswered, so **not** approved)

| # | Who | Question (from the audit's E.3) |
| --- | --- | --- |
| P-1 | Lawyer and contracts staff | L-1: who signs the contract, whether Toah Nipi countersigns, and how authority is shown. Do the IV and general contracts differ? |
| P-2 | Lawyer and forms staff | L-2: are the policy forms binding agreements or notices? Is typed-and-click enough? Do Guest House fees belong in the contract? |
| P-3 | Lawyer | L-4: consent, notices and paper-option wording, especially for individual and family bookings. **No wording in this plan is approved.** |
| P-4 | Lawyer and insurer | L-5: retention periods for documents and evidence, legal holds, who may delete. |
| P-5 | Insurer | L-6: requirements for electronically signed contracts and evidence. |
| P-6 | Director or office | L-7: public document cleanup (section 4.5). |
| P-7 | Lawyer and insurer (later project) | L-3: releases and minors. **Out of version 1.** |

---

## 3. Custom, provider or self-hosted

Research date **2026-11-07**, from vendors' official pricing and documentation pages only (section 16). List prices exclude tax. **"Unknown"** means the official pages did not say.

### 3.1 Usage estimate (read-only counts from the live database)

These are counts only. No guest details were read or printed.

| Measure | 2025 | 2026 (to Nov 7) | 2027 (booked so far) |
| --- | --- | --- | --- |
| Confirmed or Contract Sent, with dates | 176 | 242 | 75 |
| Cancelled (dated) | (not recorded for 2025) | 28 | 2 |
| InterVarsity groups among them | 24 | 24 | 20 |
| Personal Retreat types (PR*) | about 37 | about 45 | 0 |

Limitations:

- The 2025 rows come from the imported master spreadsheet. Cancellations may not have been carried over.
- 23 inquiries and 16 waitlist records are excluded.
- Test-like names make up about 3 rows.
- Seasonal peaks are not known.

**Signing scenarios used below.** These are assumptions, not measured usage:

| Scenario | Bookings/yr | Requests per booking | Requests/yr | Average per month |
| --- | --- | --- | --- | --- |
| A, low | 180 | 1 (everything in one request) | 180 | 15 |
| B, likely | 250 | 2 (contract, then the policy forms) | 500 | 42 |
| C, high | 250 | 3 (each document separately) | 750 | 63 |

BoldSign, DocuSign, SignWell and DocuSeal all state that **one envelope or document can hold several files and signers and is billed once**. So whether documents share a request is a choice, not a fixed cost. Sending the contract at booking and the policy forms nearer the stay usually means two requests per booking.

### 3.2 The three approaches in plain language

| Question | 1. Custom, in our apps | 2. Managed provider, embedded | 3. Self-hosted product |
| --- | --- | --- | --- |
| Where does the guest sign? | **Inside our portal**, on our own screens | **Inside our portal page**, but the signing panel is the provider's screen in a frame. Without embedding, the guest goes to the provider's site by email link | Our portal frames our own copy of the product, or the guest goes to its site |
| Guest account? | No | No (stated by BoldSign, SignWell, DocuSign and Documenso embeds) | No |
| Staff placing fields and reusing templates | We build it. Version 1: a signature page added to every document, plus fixed positions for the 4 standard forms (section 8) | The provider's template editor or text tags. The 13 PDFs have no fields, so templates are set up once in their editor | Its own editor |
| Typed and drawn; several documents; countersign | We build typed first, then drawn. One document per request, with an optional countersigner in a fixed order | Typed and drawn are standard. Several documents per envelope and signing order are supported | Supported |
| Email verification | We build it: a code sent by our Resend account, hashed, expiring, rate-limited | BoldSign: email code included **on all plans**. DocuSign: access codes on all plans. SignWell: emailed passcode. Documenso: access codes; an emailed one-time code is **Unknown**. DocuSeal: SMS on Pro; email code **Unknown** | Documenso or DocuSeal as above. Some features are paid even when self-hosted |
| Completed PDF, evidence, export | We produce: the completed PDF with a signature page and certificate page, an evidence file, and hashes | Completed PDF plus an audit trail or certificate. Download through the API (SignWell and BoldSign state this). Documenso seals cryptographically | Same as the provider, but we store and back it up |
| API and production access | None needed | BoldSign: Enterprise API plan. Dropbox Sign: **app approval** for embedded use. DocuSign: embedding only on "Enhanced" (contact sales, 5-user minimum), so it is ruled out | We run the API ourselves |
| Recurring charges | No new vendor fees. Supabase and Resend as today (section 3.4) | See section 3.3 | Software license (if embedding needs Pro or commercial terms) plus a server we don't have today. Hosting cost not researched |
| Data storage, retention, vendor dependence | Our Supabase project only. We set retention | Signer data and documents are also held by the vendor. We must keep our own copies. Price, plan and vendor changes are a risk | All ours, including OS updates, database, certificates and SMTP |
| What we still secure and maintain | Everything: OTP (one-time code), sessions, finalization, PDF stamping, storage, backups | Our data model, task link, webhook signature checks, copying completed files into our bucket, backups, staff screens, signer emails (or the vendor's) | Everything in the custom column **plus** a server |

### 3.3 Shortlist and estimated costs

| Option | Embedded signing? | Email verification | Listed price | Scenario A / B / C per year (estimate) | Unknowns |
| --- | --- | --- | --- | --- | --- |
| **Custom** (recommended) | Our own screens | Built on Resend | No vendor fee | **$0 in new vendor fees** at A to C, if the current Supabase and Resend plans hold (section 3.4). Developer time is the real cost | Edge Function limits with large PDFs (V-4) |
| **BoldSign Enterprise API** | Yes, included | Email code, all plans | $30/month including 40 envelopes, then $0.75 each | about $360 / $380 / $570 | Monthly or annual billing for the API tier; whether completed-PDF download is in the API (not confirmed) |
| **Documenso Teams (cloud)** | Yes ("Teams plan and above") | Access codes; email OTP **Unknown** | $40/month or $480/year, no per-document fee listed | about $480 for all three (subject to a fair-use policy, not read) | Email OTP; typed/drawn options; several documents per envelope |
| SignWell API | Clearly listed only on the **$275/month** plan | Emailed passcode | 25 documents/month free with a card on file, then "starts at $0.85" | If embedding works pay-as-you-go: about $0 / $175 / $390. If embedding needs the $275 plan: about $3,300 | **Whether embedding is in pay-as-you-go**; the "0.66" figure on the same page conflicts |
| DocuSeal Cloud Pro | Yes, on Pro | SMS on Pro; email code Unknown | $20/user/month plus $0.20 per completion | about $280 / $340 / $390 (one seat) | Email code; webhook authentication |
| Dropbox Sign API Essentials | Embedded listed; tier unclear; **app approval** required | Unknown | $75/month, 50 requests/month | about $900 | Tier mapping, overage |
| DocuSign API | Only on "Enhanced" (contact sales) | Access codes | Starter $50/month has no embedding | Not viable for embedded use | Enhanced price |

**Self-hosted options considered and not recommended:**

- **DocuSeal open source** is free under AGPLv3 with added terms. It includes multiple signers, an audit log and webhooks, but **no embedding**. Embedding needs on-premises Pro at $240/user/year plus $0.20 per completion.
- **Documenso Community** is AGPL-3.0 and needs:
  - PostgreSQL 14 or later;
  - SMTP;
  - a reverse proxy;
  - an X.509 `.p12` signing certificate ("Documenso does not ship with a signing certificate");
  - at least 1 GB of RAM.

  Its own documentation lists some embedding features as paid.

**Our current setup is static hosting plus Supabase, with no server for containers** ([README.md:849-882](../../README.md#L849)). Self-hosting would add a server, its updates, its own database and file backups, and certificate renewal. It would still depend on another project's releases. That is the most maintenance of the three.

### 3.4 What "no new vendor fee" for custom still costs

| Item | Detail (Verified on official pages 2026-11-07) |
| --- | --- |
| Supabase | Free plan: 1 GB file storage, 500 MB database, 500,000 Edge Function calls, **no automatic backups**, pauses after a week of inactivity. Pro: from **$25/month**, 100 GB storage, **7 days of daily database backups**. **Database backups never include Storage files** on any plan. The current plan is Unknown (V-3). |
| Storage growth | About 2 stored PDFs per request (the completed copy, plus the original for contracts). At 0.2 to 1 MB each and 500 requests a year, that's roughly 0.2 to 1 GB a year. That could fill the Free plan's 1 GB within a few years (Inferred). |
| Email | Resend Free: 3,000/month and **100/day**. Signing adds about 3 to 4 emails per signer (invitation, codes, completion), so roughly 1,500 to 3,000 a year. That fits, unless portal reminders already use a lot. Resend Pro is $20/month. |
| Libraries | `pdf-lib` (MIT license) for stamping PDFs in the Edge Function. No paid components. |
| Developer time (rough estimate, not measured) | First build: about **4 to 6 weeks** of focused work for phases 1 to 4. A provider integration would still take about **2 to 4 weeks** for the parts listed in section 1. Ongoing: dependency and Supabase updates, a quarterly restore drill, and fixing problems. |
| Evidence custody | Toah Nipi holds the evidence itself. This is mitigated, not removed, by giving every signer the completed copy and its fingerprint (section 9.6). |

**Both options apply regardless:** the off-site file backup (section 11) and, probably, Supabase Pro's daily database backups. Signing records will become some of the most important rows in the database.

---

## 4. Verified findings, corrections and access limits

### 4.1 How this was checked

- I re-read both repositories' current code.
- The project's Supabase CLI was already signed in. With it, I ran **catalog-only `SELECT` queries** (`supabase db query --linked`) against the live project. They covered table definitions, constraints, policies, grants, function bodies, triggers and bucket settings.
- I also ran **aggregate counts** of bookings, staff accounts and portal usage.
- No row contents, tokens or guest details were printed. Nothing was written.
- The CLI printed "Initialising login role…", which is its normal temporary login. No settings, roles or permissions were changed by this plan.

The relevant definitions are saved, without data or secrets, in [ONLINE_SIGNATURE_LIVE_SCHEMA_2026-11-07.sql](ONLINE_SIGNATURE_LIVE_SCHEMA_2026-11-07.sql). It is a **reference file, not a migration**, so it sits in `docs/audit/` and not in `supabase/migrations/`.

### 4.2 Database and storage: verified

| # | Finding | Effect on signing |
| --- | --- | --- |
| F-1 | **Guest functions are scoped correctly by token.** Every guest RPC looks up the booking from the token: `get_portal_record`, the mark/unmark ready functions, submit response, submit upload, and `portal_upload_path_is_allowed`. They are `security definer`, executable by `anon`, and return nothing for an unknown token. Guests can only move a task to `needsReview` (or back to `notStarted` from a "ready" confirmation). Nothing lets a guest set `completed`. | The new signing functions can follow the same pattern. |
| F-2 | **Guests have no table access.** Public tables have no `anon` policies, and `anon` table grants are limited to REFERENCES, TRIGGER and TRUNCATE. TRUNCATE is not reachable through the Supabase API, but see F-9. | Signing tables get **no** `anon` or `authenticated` write policies at all. |
| F-3 | **Storage, guests:** `anon` may **INSERT** and **DELETE** in `portal-uploads` only where `portal_upload_path_is_allowed(name)` is true. That means the path's first folder is a real token, the second is a task of that booking with `guest_action = 'upload_file'`, and the task is `notStarted` or `waitingOnGuest`. There is **no `anon` SELECT or UPDATE policy**. | Guests **cannot** delete staff documents (`staff-documents` is not a task id) or a file once its task is in review. They can delete files in an open upload task's folder. This corrects the earlier audit (section 4.6). Signed records still go in a separate bucket. |
| F-4 | **Storage, staff documents for guests:** the portal asks Storage, as `anon`, for a signed URL to `staff-documents/…`. **No policy lets `anon` read storage objects.** Supabase's access-control guide ties reading and overwriting objects to SELECT permission (overwriting also needs UPDATE). | **Inferred: guests probably cannot open staff-uploaded custom documents, including the contract, today.** Verify with a fictional booking (V-2). This is a Phase 0 fix, separate from signing. |
| F-5 | **Storage, staff:** `authenticated` may read, delete anything, and upload or delete under `staff-documents` if `is_active_staff()` / `can_manage_bookings()` allow it. Bucket `portal-uploads` is private, 10 MB, and limited to PDF, Word, Excel, PNG and JPEG. | The new bucket will not repeat "staff delete anything". |
| F-6 | **Staff tables:** `portal_checklist_items` and `portal_documents` have `ALL` policies for `can_manage_bookings()`. Bookings can be **deleted by admins**. Both portal tables **cascade-delete** with their booking. | Signing tables must use `on delete restrict` to the booking (R-11). |
| F-7 | **Pending repository migrations are not live:** the tables `staff_directory` and `portal_removed_uploads` do not exist, and the columns `staff_review_note` and `client_request_id` are missing. So `20261028000100_staff_directory.sql` and `20261028000300_portal_corrections.sql` are not applied. `contact_preferences` is also absent. The live database has no migration history table, which suggests migrations are run by hand. | The signing migrations must not depend on these, or they must be applied first (D-3). "Working as" still lives in each browser. |
| F-8 | The email pipeline's triggers react only to `needsReview` → `waitingOnGuest` (they stamp `email_changes_requested_at`) and to "all tasks completed". | Moving a task to Needs Review after signing sends no email by itself. "Request changes" on a signed task would trigger a "changes requested" email, which section 6 accounts for. |
| F-9 | **Hygiene, not signing:** `anon` and `authenticated` hold TRUNCATE on public tables. `audit_repair_apply` and `audit_repair_rollback` are executable by `anon`; they are not security definer, so they fail without UPDATE rights. Neither is exploitable through the API as configured. | Optional revoke in Phase 0 (D-3). |

### 4.3 Staff identity: verified

- The live project has **1 Supabase Auth user and 1 staff profile, role `admin`**. Sign-in is email and password ([StaffLogin.jsx](../../src/pages/StaffLogin.jsx)), and every route needs that session ([StaffAuthGate.jsx](../../src/auth/StaffAuthGate.jsx)).
- **Everyone on the shared login is therefore an admin.** The database's admin/staff/viewer roles exist but separate nobody today.
- **Preparing a document** means having the right to manage bookings, so anyone with the shared login can prepare and send a request. That's acceptable.
- **Signing for Toah Nipi** is a different authority. Under this plan it belongs only to a **named countersigner**. That person proves access to their own email inbox at signing time, as in R-5. The shared login cannot sign. Whoever is chosen under "Working as" is recorded for information only.
- **Who has authority to sign contracts for Toah Nipi is an organizational question** (P-1). The software records the person; it doesn't decide that they are authorized.

### 4.4 Contracts: not available

Searched:

- `documents/` in both repositories (13 PDFs plus 1 .docx, identical by MD5);
- `public/` and `dist/`;
- the other Toah Nipi folders on the Desktop (`Toah_Nipi_Website`, `Guest_Booking_Form`), by file name only;
- the live `portal-uploads` bucket (4 objects: 3 test images/PDFs and 1 flyer, file names only);
- `portal_documents` (no rows).

**Only the two one-page insurance excerpts** ("Detail of Comm Gen Liability Insurance from Terms and Conditions", general and IV) exist. They are excerpts of contract clauses, not the contract.

**Missing files needed before preparing the contract template:**

1. The current general rental contract or agreement template (2026 or 2027).
2. The current InterVarsity rental contract template.
3. Optional: the Liability Release Form, for the later project only.

Until then, development uses a **clearly fictional sample contract** (for example "SAMPLE AGREEMENT – NOT A REAL CONTRACT", with a signature block and countersignature block). We won't reconstruct a real contract from the excerpts.

### 4.5 Public document cleanup (L-7): checked, nothing changed

Checked by searching extracted text. Values are not reproduced here.

| File | Issue | Recommended cleanup | Responsible |
| --- | --- | --- | --- |
| Guest Policy Information (PDF, #1) | Names both Wi-Fi networks **with the password of the admin network** | Remove the admin network from every guest document. Decide whether to change that password | Director or office (and whoever manages the network) |
| **IV Policy Information Form (.docx, #4)** | **Also names the admin network and its password.** The earlier audit missed this | Same | Same |
| Guest House Policy (#2) | Guest network password only | Probably intended for guests. Confirm | Office |
| Sample COI Form (#12) | A real third party's certificate, partly redacted, with a signature | Replace with a fictional or fully redacted example | Office |
| All bundled documents | Served as public static files with the portal build (`import.meta.glob("/documents/*")`) | Decide which may be public. Signing templates are frozen and kept as records, so **clean these documents before they become templates** | Director or office |

### 4.6 Corrections to the earlier audit

The audit file is left as written. Read it with these corrections.

| Earlier statement | Correction |
| --- | --- |
| Guest RPC bodies and storage policies "could not be read" (B.4, G.1, Appendix) | They were read today from the live catalog (sections 4.1 and 4.2). |
| "Anonymous delete appears to be allowed"; staff documents may be changeable by guests (B.4, G.1) | Guests can delete only inside an **open** upload task's folder of their own booking. They cannot delete staff documents or files under review. No guest overwrite (no UPDATE policy). |
| "A Storage policy must allow anonymous signing on that path" for custom documents (B.3) | No such policy exists. Guest access to staff documents probably **fails** today (F-4). |
| Optional staff write policies: "unknown whether it was run" (B.4) | Staff already have `ALL` on both portal tables, live. |
| Only the Guest Policy file exposes the admin Wi-Fi (A, C, L-7) | The IV Policy Form .docx does too. |
| "The law requires a paper option to stay available in some cases" (E-8) | Overstated. E-SIGN §7001(b)(2) says no one is **required** to use or accept electronic records. RSA 294-E:5 applies only where the parties **agreed** to act electronically, and a party may refuse further electronic transactions (294-E:5 III). The consumer disclosure in §7001(c), which includes the paper option, applies only where a law requires written information for a consumer. Offering paper is how we respect those rules. It is not a general statutory mandate. Keeping paper is also your decision (R-7). |
| Status "Signed, a new status separate from needsReview" (F.2) | Replaced by R-13. Signing progress lives on the signing request, and the task moves to **Needs Review** once fully signed and stored. |
| "Seals the PDF" and "tamper seal" (A, F.2, G.6) | Version 1 adds **no cryptographic PDF signature** (section 9.6). Tamper **evidence** comes from recorded SHA-256 fingerprints and the signer's own copy, not from a seal. |
| "The completed PDF's SHA-256 matches the stored value" (I, check 5) | Kept, but **the original and completed PDFs have different fingerprints by design.** Each is hashed and recorded separately (section 9.6). |
| "Replacing a version voids its open requests" automatically; "offer to resend" (G.3, G.4) | Replacing **asks staff** to void the open request in the same step (section 10). Nothing is resent automatically (R-10), and completed records are untouched. They're shown as signed against version *n*, not as invalid. |
| "Choosing paper cancels the online request, and the reverse" (F.5, I check 7) | Staff choose the method (R-7). Switching **voids only an unsigned active request**. A completed electronic signature and its evidence are never removed, and the paper upload sits beside it as a separate record. |
| `signing-webhook` "is the only path that can mark something signed" (G.2) | That applied to a provider. In the custom design the browser **calls our signing endpoint**. That is fine because the server validates the signer's verified session, request state and document fingerprint before recording anything (section 9.4). The browser can never set a status directly. |
| Signing request expiry "at the task's due date plus a grace period" (E-13) | Replaced by R-12: no link to the due date. |
| Provider emails the completed PDF (E-15(a)) | Replaced by R-14: our own email, with a secure link and no attachment, sent once. |
| Signed copies "visible in the portal Documents tab for the life of the booking" (F.4) | Access needs the signer's verified route, not the token alone (R-14). Token holders see status only. |
| Release-law summaries, including *Lovering v. Brewster Academy* (H.3) | **Not verified against the opinion.** CourtListener refused automated access, and the opinion text was not reached. Treat as a lead for the lawyer, not a conclusion. It doesn't affect version 1, which excludes releases. |
| Phase 1 "through the chosen provider" (I) | Now depends on D-1. Section 13 is written for custom, with notes for a provider. |

### 4.7 Legal points used by this plan (primary sources)

E-SIGN, 15 U.S.C. §§7001 and 7006, and New Hampshire's UETA, RSA 294-E, were read on govinfo.gov and gencourt.state.nh.us (section 16). This plan separates three kinds of statement:

| Kind | Examples in this plan |
| --- | --- |
| **Legal rule (from the statute)** | Not denied effect **solely** for being electronic (§7001(a); 294-E:7). No one is required to use electronic records (§7001(b)(2)). Agreement to act electronically (294-E:5 II), and a right to refuse later transactions (294-E:5 III). An electronic signature is any sound, symbol or process adopted **with intent to sign** (§7006(5); 294-E:2), so **typed and drawn have the same status**. Attribution may be shown "in any manner", including the efficacy of a security procedure (294-E:9). Where information must be provided in writing, the record must be capable of retention, and blocking printing or storing makes it unenforceable against the recipient (294-E:8). Consumer consent disclosures apply **only** when a law requires written information to a consumer (§7001(c)). Other substantive law, such as contract validity and authority, still applies. |
| **Engineering recommendation** | Email codes, hashing, append-only events, a separate bucket, a certificate page, giving the signer a copy, backups. |
| **Organization policy (Toah Nipi decides)** | Which documents go online, keeping paper, countersigning, retention, who may delete, consent wording (lawyer-approved). |

**For professional review:**

- whether any document in an individual or family booking triggers §7001(c) consumer disclosures (P-3);
- whether the email-code procedure is a reasonable "security procedure" for these documents (P-1, P-5);
- the authority statement for organization signers (P-1);
- retention (P-4).

---

## 5. Staff and guest experience

### 5.1 Staff: prepare and send (Portal Admin, on a booking)

1. On a signing-capable task (*Sign and return contract*, *Sign and return Guest Policy Document(s)*), staff open **Signing**.
2. **Method** for this task: *Paper upload*, *Online*, or *Both* (R-7).
3. **Document:**
   - For the contract: upload the booking's PDF.
   - For a policy form: pick the current **standard template version**.
   - The screen shows the file name, page count and fingerprint (short form).
4. **Signer:**
   - Prefilled from the booking contact: name, email, organization, title.
   - Staff must tick **"I confirmed this signer with the group"** (R-3).
5. **Countersignature** (optional, contracts only): choose a named Toah Nipi signer from the admin-maintained list (R-5).
6. **Expiry** (optional): a date, or none (R-12).
7. **Send.** The signer gets an invitation email (test recipients only until go-live). The task shows *Awaiting signature from \<name\>*.

Afterwards, staff see a timeline:

- sent;
- code requested and verified;
- consent;
- signed;
- awaiting countersignature;
- completed and stored.

They can **resend the invitation**, **void**, **issue a new request** (new signer or version), and open the **original**, **completed copy**, **certificate** and **evidence**. Staff can't edit any of these.

### 5.2 Guest: sign

1. The signer opens the **invitation link** (`portal/?sign=<signer link>`). A portal-link holder can also open the task, which shows **Review and sign – awaiting \<masked email\>**.
2. **Send code.** A 6-digit code goes **only** to the designated email. The signer enters it.
3. **Consent screen** (draft wording until approved, P-3):
   - doing this electronically;
   - the paper option (**Request paper instead**);
   - how to get a copy;
   - what's needed to open a PDF.
4. **Review.** The signer can open or download the exact document, and must tick "I have reviewed this document".
5. **Sign:**
   - The name is prefilled and editable; correcting it is logged.
   - Typed signature by default, with **Draw instead** optional.
   - Organization signers also tick "I am authorized to sign for \<organization\>".
   - An intent statement, then the **Sign** button (R-8). Typing or drawing alone submits nothing.
6. **Done:**
   - With no countersigner: *Signed – your copy is ready* and an immediate download.
   - With a countersigner: *Signed by you – awaiting Toah Nipi*. The original stays downloadable, and the completed copy follows by email link.
7. At any point: **Decline** (reason optional), or **Ask staff a question / request a different signer**. Both are logged and shown to staff (R-4, R-12).

### 5.3 Staff: review

The task appears as **Needs Review**, labeled *Signed online* (never *Paper copy uploaded*). Staff open the completed copy and click the existing **Confirm**. The review is a separate event from the signature (R-13).

---

## 6. States: signing progress versus task review

Signing progress lives on the **signing request**. Review lives on the **portal task**, using the existing statuses. Only the server changes either one.

| # | Event | Request status | Signer status | Portal task status | Triggered by |
| --- | --- | --- | --- | --- | --- |
| 1 | Staff create a request | `draft` | `pending` | unchanged | Staff |
| 2 | Staff send | `sent` | `invited` | `waitingOnGuest` (if it was `notStarted`) | Staff |
| 3 | Signer verifies a code | `sent` | `verified` | unchanged | Signer |
| 4 | Consent and review recorded | `sent` | `consented` | unchanged | Signer |
| 5 | Guest signs; countersignature required | `awaiting_countersignature` | guest: `signed`; Toah Nipi signer: `invited` | unchanged (label "Awaiting Toah Nipi") | Signer, then the server |
| 6 | Last required signature | `completing` | `signed` | unchanged | Server |
| 7 | Completed PDF, certificate and evidence stored and hashed | `completed` | — | **`needsReview`** (only if not already `completed`) | Server, same step |
| 8 | Staff Confirm | `completed` | — | `completed` (existing flow) | Staff |
| 9 | Staff request changes on a signed task | `completed` (kept, marked *superseded* once a new request exists) | — | `waitingOnGuest` (existing flow); staff then issue a new request | Staff |
| 10 | Signer declines | `declined` | `declined` | unchanged; badge in Portal Admin | Signer |
| 11 | Expiry date passes | `expired` | — | unchanged | Server (checked on access) |
| 12 | Staff void | `voided` (reason required) | — | unchanged | Staff |
| 13 | Staff switch the task to paper | open unsigned request becomes `voided`; completed requests unchanged | — | upload allowed again (existing upload → `needsReview`) | Staff |
| 14 | Finalization fails part-way | stays `completing`, retried | — | unchanged | Server (retry) |

Rules:

- **One active request per task.** `sent`, `awaiting_countersignature` and `completing` count as active. This is enforced by a unique partial index.
- While a request is active, the guest **upload** path is refused server-side.
- A new online request is refused while a paper upload is in `needsReview`, unless staff explicitly mark it superseded. Both records are kept.
- Rows are never deleted. "Superseded", "voided" and "declined" are labels on kept records.
- Booking status and the contract-returned date are never touched (R-13).
- **Progress weighting:** the staff app counts `needsReview` as 0.5, the portal as 1. This mismatch is still present ([portalRules.js:41](../../src/utils/portalRules.js#L41); portal `App.jsx:744`). Fix it separately (Phase 0) so signed-but-unreviewed tasks show consistently.

---

## 7. Data, storage, server and UI changes

Proportionate to version 1. Five tables, one bucket, one Edge Function, and changes to two existing guest functions.

### 7.1 Database (new migration in the staff repository, run by you after review)

| Table | Purpose | Key columns |
| --- | --- | --- |
| `signing_document_versions` | One frozen PDF. **Insert-only**; a trigger refuses updates to file columns | `id`, `kind` (`contract`/`acknowledgment`), `title`, `template_key` (for standard forms), `booking_id` (contracts only, `on delete restrict`), `storage_path`, `sha256`, `byte_size`, `page_count`, `layout` (jsonb, section 8), `supersedes_version_id`, `created_at`, `created_by`, `prepared_by_label` ("Working as", informational) |
| `signing_requests` | One request on one version for one task | `id`, `booking_id` (`on delete restrict`), `checklist_item_id` (`on delete set null`), `item_key` copy, `booking_label` copy, `version_id`, `version_sha256` copy, `status`, `requires_countersignature`, `expires_at` (nullable), `legal_hold`, `sent_at`, `completed_at`, `voided_at`, `void_reason`, `superseded_by` |
| `signing_signers` | People on a request, in order | `id`, `request_id`, `sign_order`, `role` (`guest`/`toah_nipi`), `name`, `email`, `organization`, `title`, `status`, `link_hash` (hash of the invitation link key), `authority_confirmed`, `signature_method` (`typed`/`drawn`), `typed_name`, `signed_at` |
| `signing_events` | **Append-only** log | `id`, `request_id`, `signer_id`, `type`, `at`, `ip`, `user_agent`, `detail` (jsonb: consent text version and hash, document hash shown, and so on). No portal tokens, codes or session keys are ever stored |
| `signing_artifacts` | Files produced | `request_id`, `kind` (`completed_pdf`, `signature_image`, `evidence_json`), `storage_path`, `sha256`, `byte_size`, `created_at` |

Supporting tables:

- `signing_codes` and `signing_sessions`: hashed code or session key, signer, expiry, attempts, used/revoked time. Can be cleaned after expiry; they're not evidence.
- `signing_consent_texts`: versioned text, `approved_by` and `approved_at` empty until the lawyer approves.
- `signing_countersigners`: admin-maintained name and email.

Access rules:

- **`authenticated` (staff): SELECT only** on all signing tables.
- **No INSERT, UPDATE or DELETE policy for anyone.** All writes go through the Edge Function using the service role.
- `anon`: nothing.

So the shared login can **read** but cannot alter or delete signing records through the API. A Supabase dashboard user or the service role still can (section 9.6).

Changes to existing objects:

- `portal_upload_path_is_allowed` and `portal_submit_checklist_upload` also require that the task allows paper and has **no active signing request**.
- `get_portal_record` adds a per-task `signing` summary: status, masked signer email, and whether a countersignature is pending. It returns **no** files, emails or evidence.
- `portal_checklist_items` gets `signing_methods text` (`paper`, `online`, `both`; null = today's behavior).
- The `portal_email_messages` checks gain the new template and trigger values (section 9.5).

### 7.2 Storage

- New private bucket **`signing-records`**, PDF and PNG only.
- **No `anon` policies. No `authenticated` policies.** Staff and signers receive short-lived signed URLs **issued by the Edge Function** after its own checks.
- Paths contain **no portal token**:
  - `versions/<version_id>/original.pdf`
  - `requests/<request_id>/completed.pdf`
  - `requests/<request_id>/signature-<signer_id>.png`
  - `requests/<request_id>/evidence.json`
- Writes never upsert. If a path already exists, the server compares fingerprints instead of overwriting.

### 7.3 Server: one Edge Function, `signing` (staff repository, `supabase/functions/signing/`)

| Action | Caller and check |
| --- | --- |
| `prepare_version`, `create_request`, `send`, `resend_invite`, `void`, `staff_file_url`, `retry_finalize` | Staff JWT plus `can_manage_bookings()` |
| `request_code`, `verify_code` | Invitation link key, **or** portal token plus request id. The code is always sent to the designated email |
| `document_url`, `record_consent`, `sign`, `decline`, `contact_staff`, `completed_url` | A **verified signing session** (from `verify_code`), bound to that signer and request |
| Countersigner actions | Same as the guest actions, through their own invitation link and code. Never the staff login |

Shared details:

- Uses `pdf-lib`.
- Sends email through the existing Resend setup and the existing **mode / allowlist / live-gate** guards (`docs/portal-email/SETUP.md`), so development mail can only reach test recipients.

### 7.4 Staff app (this repository)

- `PortalAdminView`: the Signing panel and timeline (section 5.1). Signing badges in the task list. The Confirm dialog shows *Signed online* or *Paper copy*.
- Admin settings: countersigner list, consent text versions (shown as **DRAFT** until approved), standard template versions.
- Backups page: the signing data in backup v3, and the signing file export (section 11).
- Booking delete: a clear refusal message when signing records exist (`restrict`).

### 7.5 Guest portal (`Toah_Nipi_Portal`)

- A sign route (`?sign=`) and a "Review and sign" button on task cards.
- Screens for code, consent, review, sign (typed, plus an optional drawing pad), done, decline and contact staff.
- It calls the `signing` function with the publishable key and never touches tables or the bucket directly.
- No portal token is put into signing links or emails.

---

## 8. Preparing the actual documents

| Document | Plan |
| --- | --- |
| **Contract (general and IV)** | Templates unavailable (V-1). Version 1 adds a **signature page** after the last page. It names the document title, version fingerprint and page count, then each signer's block (typed or drawn signature, printed name, organization, title, date and time), followed by the **certificate page**. This works for any PDF without placing fields. Whether the contract's own signature lines must also be filled, and whether a Toah Nipi block is needed, depends on the real template and P-1. Stamping onto the contract's own lines can be added per template later. |
| **Guest Policy Information (#1, Letter, 3 pages)** | Clean up first (section 4.5). Then freeze it as a template version with **fixed positions** for name, signature and date on page 3 (measured once from the underscore lines' coordinates), plus the certificate page. |
| **Guest House Policy (#2, A4) and IV Guest House Policy (#3, A4)** | Same as #1, with positions on page 2. #2 contains fees, so P-2 asks whether it belongs in the contract. Version 1 treats it as an acknowledgment unless told otherwise. |
| **IV Policy Information Form (#4, .docx)** | Signing must use a **PDF**. Staff export the cleaned-up Word file to PDF, check it, and upload it as the template version. The .docx stays as the paper download. Positions for group name, signature and date are measured from the exported PDF. A new export means a new version. |
| **IV Clean-Up Procedures (#5)** | Not a signing document. Per R-9, rename the task to "Read and acknowledge …" with a confirm action **after staff confirm** (Phase 0). Existing rows keep their history. Open `upload_file` rows are listed for staff before conversion, and nothing is converted silently. |
| Others (#6 to #14) | Information only. Not signing templates. |

The page size of the added pages follows the last page (Letter or A4). Positions are stored in PDF points in `layout`, one entry per signer role. If a position is missing, the signature page alone is used. There is no click-to-place editor in version 1. It would only be needed if staff later upload many different layouts.

---

## 9. Verification, consent, access, downloads, countersigning

### 9.1 Email verification (R-6, R-12)

- A 6-digit code, **10-minute expiry, single use, 5 wrong attempts** then a new code is needed. At most **5 codes an hour** per signer.
- Stored only as an HMAC (keyed hash) with a server secret.
- A verified session lasts **60 minutes** of activity, is bound to signer and request, and can be revoked.
- While the request is active, the signer can always request a new code, whatever the task's due date.
- The screen says, in wording to be approved (P-3), that the code shows access to the inbox, not identity or authority.

### 9.2 Who can reach a request

- Anyone with the portal token sees **status only**, with the signer's email masked. They may press "send code", but it goes only to the designated inbox.
- A request ID with the wrong token, or a link key for another request, gets the same "not found" answer, so nothing leaks.
- Guests can't change the signer (R-4).

### 9.3 Consent

- Shown once per signer per request, before review.
- The event records the **consent text version and its hash**.
- **Request paper instead** records a decline-for-paper event and shows staff a prompt to switch the method.
- Withdrawing consent for future transactions is a staff procedure (checklist, section 15).

### 9.4 Signing and finalization (no forged completion)

The browser sends:

- the session;
- the method;
- the typed name or drawing (PNG, size-limited);
- the ticked statements;
- **the document fingerprint it was shown**.

The server then does these steps, in a database transaction with a row lock on the request:

1. Checks the session is valid and belongs to this signer and request.
2. Checks the request is active and not expired, and that it is this signer's turn.
3. Checks the consent event exists.
4. Checks the fingerprint equals the version's recorded `sha256`, and **re-hashes the stored original**.
5. Checks the signer hasn't already signed.
6. Records the signature and events.

If this was the last signature, it builds the completed PDF and moves on to finalization (section 10). The browser can't set any status, and a replayed or edited request fails one of these checks.

### 9.5 Downloads and completion emails (R-14)

- Immediately after the last signature, the session offers the completed copy (a 10-minute signed URL).
- Each signer gets **one** completion email with a link back to `?sign=<their link>`. A fresh code then gives a fresh download, indefinitely, unless a retention policy later says otherwise.
- Duplicates are prevented by the existing unique `dedupe_key` (`signing-complete:<request>:<signer>`).
- Emails are sent immediately through the same mode, allowlist and live-gate checks as portal email. No attachment.
- The original document is downloadable before and during signing, so nothing blocks retention (294-E:8).

### 9.6 Signatures, fingerprints, audit records, PDF certificates and timestamps

These are five different things. Version 1 uses the first three:

| Thing | What it is | Version 1 |
| --- | --- | --- |
| **Ordinary electronic signature** | The typed name or drawing, adopted with intent through the Sign action | **Yes.** It is what the statutes recognize |
| **Document fingerprint (SHA-256)** | Detects any change to a file | **Yes.** The **original** and the **completed** PDF are hashed **separately**. They differ by design, because the completed file adds pages. The completed hash can't be printed inside itself, so it goes in the evidence file, the staff view and the **completion email** |
| **Audit record** | Who did what and when, how they were verified, what they saw | **Yes**, append-only `signing_events`, plus `evidence.json` and a readable certificate page |
| **Cryptographic PDF signature** | A certificate-based signature that PDF readers verify | **No.** It is not required by E-SIGN or UETA. A self-signed certificate shows as "untrusted" in readers, and a trusted one costs money and needs key management. It can be added later if the insurer or lawyer asks |
| **Trusted timestamp (RFC 3161)** | A third party vouching that a hash existed at a time | **No** in version 1. It is a possible later step if independent proof of time is wanted |

**What these protect against, and what they don't:**

- **Guests:** can't read, write or delete anything in signing tables or the bucket.
- **The shared staff login**, at every role: can read, and can only change things through logged function actions. It can't edit or delete records.
- **Database owners, the Supabase dashboard account and the service role** can change any row and any file, **and the stored fingerprint beside it**. A checksum kept next to a file doesn't prove that a privileged administrator couldn't change both.

The independent checks are:

- **the signer's own copy**, plus the fingerprint in their completion email;
- **off-site backups** with their manifests (section 11).

If tampering were suspected, comparing these would show it. Limit who holds dashboard access, and keep it separate from daily staff use. That's organization policy (checklist, section 15).

### 9.7 Countersigning (R-5)

- The order is fixed: guest first, then Toah Nipi, so Toah Nipi signs exactly what the guest signed.
- The countersigner is chosen from the admin list. They are invited by their own email, verify with a code, and see the guest's signature details before signing.
- Adding or changing a countersigner in settings is logged.

---

## 10. Versions, concurrency, retries and recovery

**Versions:**

- A version is immutable from creation.
- "Replace document" creates version *n*+1. If a request on version *n* is active, staff must **void it in the same step**, after a warning (R-10). Nothing is sent automatically. Staff then choose whether to create a request for *n*+1.
- Completed records on *n* stay exactly as they are, shown as "signed against version *n*".

**Concurrency:**

- A unique partial index allows one active request per task. Signers have unique `(request_id, sign_order)`.
- Finalization runs under a row lock, so two Sign clicks, or a sign during a void, are processed one after the other. The second fails its state check with a clear message.
- A sign after a replacement fails because the request is voided, and the fingerprint check catches it as well.

**Duplicates:** `sign` is idempotent per signer. A repeat returns the existing result. Emails are de-duplicated by `dedupe_key`.

**Finalization steps and recovery:**

1. Transaction: record the last signature, then set the request to `completing`.
2. Build the completed PDF and evidence, then upload them to their fixed paths without overwriting. If a file already exists, compare its fingerprint.
3. Transaction: insert the artifacts, set the request to `completed`, set the task to `needsReview` (if not `completed`), and queue the completion emails.

If step 2 or 3 fails, the request stays `completing`, the signer sees "Signed – your copy is being prepared", and the step is retried:

- on the next access;
- from the 15-minute scheduler that already exists;
- or with staff **Retry**.

Re-running a step never makes a second copy or a second email. **The task reaches Needs Review only after step 3** (R-13).

**Voids and declines:** they never delete rows or files.

---

## 11. Backups and restore verification

| Layer | Plan |
| --- | --- |
| Database rows | Add the signing tables to manual backup **version 3**. Restore is **insert-missing-only** for signing tables: it never updates or deletes them. "Replace" restore skips them. Recommended: Supabase **Pro** daily database backups (7 days) if the project is on Free (D-2). These never include files. |
| **Files** | A new **Signing files export** on the Backups page. Staff download every `signing-records` file through short-lived URLs, together with a `manifest.json` (path, size and SHA-256 for every artifact and version, plus counts), into one archive. It is stored off-site where you choose (D-2). Whether this needs a zip library is decided in Phase 4 after checking existing dependencies. |
| Integrity check | The export re-hashes each file against the database fingerprints and lists any mismatch before saving. |
| Restore of files | A staff function **uploads only missing files** from an export and **refuses** a file whose fingerprint doesn't match its manifest. |
| Restore drill | Each quarter (organization policy; the frequency is yours to set), restore the latest database backup and file export into a **separate scratch Supabase project** or a local stack. Run the verification script (counts, fingerprints, one completed PDF opened by hand) and record the date and result. Run it first in Phase 4 as an acceptance check. |
| Booking deletion and token changes | Signing records use `restrict` and token-free paths, so neither affects them. |

---

## 12. Migration and compatibility

- **Existing tasks and uploads are unchanged.** `signing_methods` null means today's upload behavior. No existing row is converted.
- Existing paper uploads stay labeled as uploads.
- **Live database prerequisites (F-7):** the signing migration will be written to stand alone. You decide separately whether to apply the pending `staff_directory`, `contact_preferences` and `portal_corrections` migrations first (D-3).
- **Backup v2 files** still restore. Supported versions are an explicit list (`SUPPORTED_BACKUP_SCHEMA_VERSIONS` in [backupFormat.js](../../src/utils/backupFormat.js)), so v3 is added to that list. **An older app build will refuse a v3 file**, so update the app before taking v3 backups. A v3 test fixture will be added.
- **Email:** new template keys (`signing_invite`, `signing_code`, `signing_complete`) and trigger values are added to the existing check constraints. Existing templates and modes are untouched.
- **Guest portal:** older portal builds that don't know about `signing` ignore the new field. During rollout, staff simply don't enable *Online* until the portal is updated.
- **SQL is handed to you to review and run.** Nothing is applied to the live project by the build work.

---

## 13. Development phases and acceptance checks

**Can be built and tested before professional review:** phases 1 to 4, with the fictional sample contract, the cleaned sample forms, consent text marked **DRAFT**, local or scratch databases, and email in dry-run or test-allowlist mode.

**Must wait:** **production activation** (section 15), which is a separate step.

### Phase 0: separate small fixes (each needs your go-ahead, one at a time)

- Fix guest access to staff documents (F-4), after confirming the failure on a fictional booking.
- Align the progress weighting.
- E-10 IV wording (after staff confirm).
- Optional hygiene revokes (F-9).
- Your decision on the pending migrations (F-7).
- The L-7 cleanup itself is for the office (section 4.5).

### Phase 1: schema, storage and server core (no UI)

Migration, bucket, `signing` function: codes, sessions, consent, sign, finalize, downloads. Typed signatures. Tested with pglite and Deno tests.

**Acceptance:**

1. **Cross-booking:** booking A's token, or A's link key, can't see, code, sign or download B's request, even with B's IDs.
2. **Unauthorized signer:** without a verified session, every action fails. A session for signer X fails for signer Y and for another request.
3. **Forged completion:** no `anon` or `authenticated` call can insert or update any signing table or the bucket. Direct RPC and REST attempts fail. `sign` with a wrong fingerprint, a voided or expired request, or out of turn fails.
4. **Codes:** expired, reused, wrong after 5 attempts, over the hourly limit, and old codes after a new one are all refused. A **replayed** request with a used session or code is refused.
5. **Duplicates:** two simultaneous `sign` calls give one signature, one completed PDF, one email per signer.
6. **Replacement during signing:** replacing the version while a signer is on the review screen makes their Sign fail with "document changed". The old completed requests are untouched.
7. **Fingerprints:** each artifact's stored SHA-256 matches. Changing one byte is detected by the verification script. Original and completed fingerprints differ.
8. **Failure recovery:** forcing a storage failure in step 2 leaves the request `completing` and the task unchanged. A retry completes it once.
9. **Task rule:** the task moves to `needsReview` only after step 3. Booking status and the contract-returned date are unchanged.
10. **Downloads:** completed copies are reachable only through a verified session or staff check. URLs expire after 10 minutes. A link for another request is refused.

### Phase 2: staff screens

Prepare, send, timeline, void, new request, paper/online switch, countersigner list, consent versions.

**Acceptance:**

- Switching to paper voids only an unsigned active request and never removes a completed one.
- Paper upload is refused while a request is active.
- Request changes on a signed task keeps the record.
- Booking delete is refused with signing records.
- Mock-browser checks pass in the existing harness.

### Phase 3: guest screens

Typed signing first, then the drawing pad.

**Acceptance:**

- Works on a phone (narrow screen, iOS and Android PDF opening).
- Decline and contact-staff are logged.
- Masked email is shown.
- Download works immediately and again after the session expires (new code).
- If drawing proves unreliable on phones, ship typed only and note it (R-8).

### Phase 4: countersigning, backups, email

**Acceptance:**

- Guest-then-Toah Nipi order is enforced. The shared login can't countersign.
- Completion email is sent once per signer, only after all signatures, only to the test allowlist.
- Backup v3 plus file export, then restore into a scratch project: counts and all fingerprints match.
- Replace restore leaves signing records intact.

### If a provider is chosen instead (D-1)

Phases 1 and 3 change:

- create the envelope from the server;
- embed the provider's signing URL;
- a `webhook` action that **verifies the provider's signature** (for example SignWell's HMAC, or Documenso's secret);
- then download the completed PDF and audit file into `signing-records`.

Extra checks:

- Webhooks with a bad signature, unknown ID or replayed event are rejected.
- Our status changes only after the files are stored.

Phases 2 and 4 and all the other checks stay the same.

---

## 14. Decisions you still need to make

| # | Decision | Recommendation |
| --- | --- | --- |
| **D-1** | **Approach:** custom, BoldSign Enterprise API, or Documenso Teams | **Custom** (section 1) |
| **D-2** | **Backups:** confirm the Supabase plan, and whether to move to Pro ($25/month) for daily database backups. Choose where signing file exports are kept off-site (for example a restricted OneDrive or Google Drive folder) | Pro if currently on Free; a restricted shared drive folder |
| **D-3** | **Phase 0:** approve each small fix separately: staff-document access (F-4), progress weighting, E-10 wording (after staff confirm), hygiene revokes (F-9), and whether to apply the pending repository migrations (F-7) | Do F-4 and progress weighting first |

Not your decision, but needed from others: the contract templates (V-1), the countersigning practice and countersigner (P-1), and the answers in section 2.4.

---

## 15. Checklist before real guest signing

This is separate from development. All items must be done.

- [ ] Lawyer's answers recorded for L-1, L-2 and L-4, with **approved consent, intent, authority and paper-option wording** loaded as the approved consent version.
- [ ] Insurer's answer for L-6. Lawyer and insurer on L-5, with retention configured, or a written interim "keep everything, delete nothing" decision.
- [ ] Real contract templates (general and IV) prepared as versions and checked by the contracts staff member. Countersigner named and their email verified, if L-1 requires one.
- [ ] Public documents cleaned (L-7) **before** they are frozen as templates. Admin Wi-Fi decision made.
- [ ] Phase 1 to 4 acceptance checks passed on the final build. A restore drill done and recorded.
- [ ] Supabase backup plan in place (D-2). First signing file export taken and stored off-site.
- [ ] Supabase dashboard and service-role access limited to named people. List kept.
- [ ] Email live gate opened **for signing** only after a test run with fictional bookings and staff mailboxes.
- [ ] Staff procedure written for: void and reissue, signer change requests, paper requests, consent withdrawal, declines, failed finalization, and "Retry".
- [ ] Pilot with a few real bookings with *Both* methods enabled, then review.

---

## 16. Sources

Accessed **2026-11-07**.

**Law (primary):**

- 15 U.S.C. 7001: <https://www.govinfo.gov/content/pkg/USCODE-2024-title15/html/USCODE-2024-title15-chap96-subchapI-sec7001.htm>
- 15 U.S.C. 7006: <https://www.govinfo.gov/content/pkg/USCODE-2024-title15/html/USCODE-2024-title15-chap96-subchapI-sec7006.htm>
- RSA 294-E: <https://gc.nh.gov/rsa/html/XXVII/294-E/294-E-mrg.htm>
- *Lovering v. Brewster Academy*: opinion **not reached** (CourtListener refused automated access).

**Vendors (official pages):**

- BoldSign: <https://boldsign.com/pricing>, <https://developers.boldsign.com/identity-verification/introduction?region=us>, <https://developers.boldsign.com/api-overview/developer-sandbox-account?region=us>
- SignWell: <https://www.signwell.com/api-pricing/>, <https://www.signwell.com/api/>, <https://developers.signwell.com/reference/createdocument.md>, <https://developers.signwell.com/reference/event-hash-verification.md>
- Documenso: <https://documenso.com/pricing>, <https://documenso.com/self-hosted>, <https://docs.documenso.com/docs/developers/embedding>, <https://docs.documenso.com/docs/self-hosting/getting-started/requirements>, <https://docs.documenso.com/docs/policies/enterprise-edition>, <https://docs.documenso.com/docs/developers/webhooks/setup>
- DocuSeal: <https://www.docuseal.com/pricing>, <https://www.docuseal.com/on-premises>, <https://github.com/docusealco/docuseal>, <https://www.docuseal.com/docs/embedded>
- DocuSign: <https://ecom.docusign.com/plans-and-pricing/developer>, <https://ecom.docusign.com/plans-and-pricing/esignature>, <https://developers.docusign.com/docs/esign-rest-api/go-live/>
- Dropbox Sign: <https://sign.dropbox.com/products/dropbox-sign-api/pricing>, <https://developers.hellosign.com/docs/app-approval/overview/>, <https://developers.hellosign.com/docs/embedded-signing/walkthrough/>

**Platform:**

- Supabase: <https://supabase.com/pricing>, <https://supabase.com/docs/guides/platform/backups>, <https://supabase.com/docs/guides/storage/security/access-control>
- Resend: <https://resend.com/pricing>

**Notes on the vendor pages:**

- Some pricing tables were garbled when read (Dropbox Sign; BoldSign's monthly/yearly toggle).
- SignWell's page shows conflicting per-document figures.
- **Re-check prices with the vendor before any purchase.**

**Repository and database evidence:**

- [ONLINE_SIGNATURE_LIVE_SCHEMA_2026-11-07.sql](ONLINE_SIGNATURE_LIVE_SCHEMA_2026-11-07.sql)
- [src/pages/PortalAdminView.jsx:251-330](../../src/pages/PortalAdminView.jsx#L251)
- [src/utils/portalRules.js](../../src/utils/portalRules.js)
- [docs/portal-email/SETUP.md](../portal-email/SETUP.md)
- Portal `src/App.jsx` (upload at 525-584, staff-document URL at 1630-1670, progress at 734-746)
