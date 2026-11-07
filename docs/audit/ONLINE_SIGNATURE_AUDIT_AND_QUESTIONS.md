# Online Document Signing: Audit and Open Questions

**Status:** Audit and questionnaire. Nothing has been implemented.
**Prepared:** 2026-11-07 (code inspected and legal sources read on this date)
**Scope:** `Toah_Nipi_Booking_Software` (staff app, this repository) and `Toah_Nipi_Portal` (guest portal, separate repository)
**Not legal advice.** This document gathers facts and questions for Toah Nipi's attorney and insurer. It does not decide whether any document is enforceable, and it contains no approved consent wording.

How to use it: read A, skim B to D, then fill in every **My answer:** in section E. Those answers will become the implementation prompt.

Evidence labels used below:

- **Verified:** read in the code, SQL or PDF in this audit.
- **Documented only:** stated in a README or doc; the code or live database that would prove it was not available.
- **Inferred:** a conclusion from verified facts; confirm before relying on it.

---

## Contents

- [A. Main findings and recommended direction](#a-main-findings-and-recommended-direction)
- [B. Verified current workflow](#b-verified-current-workflow)
- [C. Document inventory](#c-document-inventory)
- [D. Questions already answered by the audit](#d-questions-already-answered-by-the-audit)
- [E. Remaining questions for you](#e-remaining-questions-for-you)
- [F. Proposed workflow](#f-proposed-workflow)
- [G. Technical gaps and security requirements](#g-technical-gaps-and-security-requirements)
- [H. Legal review and sources](#h-legal-review-and-sources)
- [I. Suggested implementation phases](#i-suggested-implementation-phases)
- [Appendix: what was checked and what was not](#appendix-what-was-checked-and-what-was-not)

---

## A. Main findings and recommended direction

### What exists today

- **There is no signing of any kind.** Neither app has PDF viewing, form filling, signature capture, document hashing, versioning or a signing audit trail. Neither `package.json` has a PDF library. The only SHA-256 in either app is the backup-file checksum ([src/utils/backupFormat.js](../../src/utils/backupFormat.js)). The README says the same ([README.md:403-419](../../README.md#L403-L419)).
- **"Signing" is print, sign and upload.** Staff assign a task such as *Sign and return contract*. Its only guest action is `upload_file`. The guest downloads a PDF, signs it outside the system, and uploads any PDF, Word, Excel or image file of 10 MB or less. Staff open the file and click Confirm. Nothing checks that the upload is the right document or that it is signed.
- **Tasks and documents are not linked.** A task such as *Sign and return contract* does not point at a particular PDF. A guest has to work out which file in the Documents tab goes with which task.
- **The two documents that matter most are not in the system.** The **rental contract** is not in the standard catalog. Staff upload it per group as a custom document. The **Liability Release Form** that every guest must sign is not in either project at all. The portal only asks the group leader to *confirm* that releases were sent and completed ([src/pages/PortalAdminView.jsx:316-327](../../src/pages/PortalAdminView.jsx#L316-L327)).
- **Of the 13 PDFs, 3 have a signature block, and all 3 are the same kind of form:** a read-and-comply acknowledgment with a printed name, a signature and a date, signed by "Individual Guest or Guest Group Leader". The Word file is a 4th of the same kind. None of these files is fillable. All are text PDFs except the scanned sample insurance certificate and the hiking map.
- **One task asks for a signature the document does not have.** *Sign and return Guest Clean-Up Procedures (IV guests)* points at a PDF with no signature line.
- **Guest identity is the portal link and nothing else.** Anyone who holds the link can act for the booking. There is no login, no email check, and no record of who did what. That is fine for checklist uploads. It is the weakest part of any signature.
- **Staff identity is also weak.** Everyone shares one Supabase login, and "Working as" is a per-computer name picker. Staff Confirm records no reviewer.

### What online signing would require

A signature process that will hold up needs these eight things. Section G lists the code changes behind each one.

1. **Exact document.** A staff-prepared PDF, frozen and fingerprinted (hashed) before anyone signs.
2. **Signer.** A named person (name, email, role, and the organization if they sign for one), not just "whoever has the link".
3. **Consent to sign electronically.** Agreement to do business electronically, recorded before signing, with a paper alternative.
4. **Intent.** A clear act of signing, with wording that says what the click means, after the signer can see the whole document.
5. **Evidence.** A server-side record of the time, the method used to check the signer, the document fingerprint, the IP address and browser, and each step.
6. **Sealed result.** A completed PDF that includes the signature and a certificate page, stored where neither guests nor ordinary staff can change it, with its own fingerprint.
7. **Copy for the signer.** A download the signer can keep and print, now and later.
8. **Server-enforced status.** Only the server can mark a task signed. The browser cannot.

### Recommendation

**Integrate an established e-signature provider for the rental contract, and anything else that carries indemnity, liability or money terms. Decide later whether to build in-house acknowledgment signing for the low-risk policy forms.** The suggested first version is in [I. Phase 1](#phase-1--first-version-recommended-scope).

Reasons:

- The contract is the highest-stakes signature. It may need a Toah Nipi countersignature, and the signer acts for an organization. Providers already do signer email checks, signing order, tamper-evident sealing, certificates of completion and long-term evidence. Building and defending that ourselves is a large ongoing job for a small team.
- The portal and database already have the right shape for this. A provider fits behind a token-checked server function and a task status, much like today's upload flow.
- The policy acknowledgments are simple: one signer, name and date, no countersignature. If the provider's price per envelope is a problem, a careful in-house "acknowledge and sign" flow for these alone is realistic. It still needs most of the server-side protections in section G.
- **A provider does not make a document enforceable.** It provides process and evidence. Whether each contract, waiver or release is valid, who may sign, and whether a parent can sign for a minor are questions for an attorney, whatever tool is used.

### Decisions that matter most

These are the key questions in section E:

1. Which documents should be signed online in the first version? (E-1)
2. Provider or in-house, and what budget per month or per year? (E-2, E-3)
3. Who signs the contract, and does Toah Nipi countersign? (E-4, E-5)
4. Should individual participant Liability Releases come online, with minors and guardians? This would greatly increase scope and legal risk. (E-6)
5. How must signers prove who they are? (E-7)
6. Attorney review of the release, contract, consent wording and minors question before real use. (L-1 to L-6)

---

## B. Verified current workflow

### B.1 How the pieces connect

```text
Staff app (this repo)                     Supabase                         Guest portal (separate repo)
──────────────────────                    ────────                         ────────────────────────────
Staff login (one shared login)            bookings.portal_token            /?portal=<token>
PortalAdminView                           portal_checklist_items           App.jsx
  assign tasks (fixed catalog)  ───────►    (status, guest_action,          get_portal_record(token) ◄── RPC
  assign standard docs          ───────►     uploaded_file_*)               Documents tab:
  upload custom docs ──┐                  portal_documents                    bundled /documents/*.pdf (public)
  confirm / reopen /   │                    (title, file_name,                or signed URL from Storage
  request changes      │                     storage_path)                 Checklist tab:
  open guest upload    │                  portal_removed_uploads             upload → Storage, then
                       └──────────────►   Storage: portal-uploads (private)    portal_submit_checklist_upload ◄── RPC
portal-email Edge Function ───────────►   portal_email_* tables            Emails link to the portal; no attachments
```

### B.2 Staff side

| Area | Behavior | Evidence |
|---|---|---|
| Task catalog | 11 fixed tasks. 5 are `upload_file`: contract, guest policy documents, IV clean-up, insurance, schedule. 4 are `mark_ready`: food allergy, release sent, release completed, guest count. 2 are `none`: deposit, balance. | **Verified** [PortalAdminView.jsx:251-330](../../src/pages/PortalAdminView.jsx#L251-L330) |
| Document catalog | 14 standard files, by file name, each with an audience (general or InterVarsity). **No contract and no release form.** | **Verified** [PortalAdminView.jsx:342-445](../../src/pages/PortalAdminView.jsx#L342-L445) |
| Standard document row | Inserted as `portal_documents` with `status: "ready"` and `uploaded_by_guest: false`. **No `item_id`**, so it is not linked to a task. The file itself is not uploaded; the portal finds it by file name. | **Verified** [PortalAdminView.jsx:868-925](../../src/pages/PortalAdminView.jsx#L868-L925) |
| Custom document | Row inserted first, then the file goes to `portal-uploads/<portal_token>/staff-documents/<document_id>/<file name>`, then `storage_path` is saved on the row. Failures clean up both. Also no `item_id`. | **Verified** [PortalAdminView.jsx:4200-4380](../../src/pages/PortalAdminView.jsx#L4200-L4380), [PortalAdminView.jsx:927-990](../../src/pages/PortalAdminView.jsx#L927-L990) |
| Replace a document | **No replace action.** Staff remove the row and upload a new one. Removal deletes the row but leaves the file in Storage. | **Verified** `removePortalDocument` [src/services/portalCorrections.js](../../src/services/portalCorrections.js) |
| Review | Staff open the guest file through a 10-minute signed URL ([PortalAdminView.jsx:204-243](../../src/pages/PortalAdminView.jsx#L204-L243)). **Confirm** changes `needsReview` to `completed`, but only if the status is still `needsReview` ([PortalAdminView.jsx:3995-4060](../../src/pages/PortalAdminView.jsx#L3995-L4060)). **The reviewer is not recorded.** | **Verified** |
| Corrections | *Request changes* (`needsReview` to `waitingOnGuest`, with an optional note), *Reopen*, *Change due date*, and *Remove*. Removing a task that has an upload moves the file to `removed-uploads/...` and records it in `portal_removed_uploads`. | **Verified** [portalCorrections.js](../../src/services/portalCorrections.js); migration [20261028000300_portal_corrections.sql](../../supabase/migrations/20261028000300_portal_corrections.sql) |
| Staff identity | One shared Supabase login. "Working as" records a name per computer for checklist completion. Portal Confirm uses neither. | **Verified** [src/components/BookingChecklists.jsx:345-351](../../src/components/BookingChecklists.jsx#L345-L351); [README.md:421-439](../../README.md#L421-L439) |
| Contract status | Booking `contractReturnedDate` is imported from the master spreadsheet. Confirming the portal contract task does not set it. The audit fix moved contract progress to Portal Admin. | **Verified** [Dashboard.jsx:1820-1889](../../src/pages/Dashboard.jsx#L1820); [AUDIT_FIX_REPORT.md:85](AUDIT_FIX_REPORT.md) |

### B.3 Guest side

| Area | Behavior | Evidence |
|---|---|---|
| Access | The token is read from `?portal=`. `get_portal_record(p_portal_token)` returns the booking, its tasks and its documents. Missing or unknown token: "Portal unavailable". | **Verified** [Portal src/services/portalService.js], [Portal src/App.jsx:690-816] |
| Identity | **The token is the only credential.** No login, no email check, no device binding, no expiry. Anyone with the link sees the same thing and can do the same things. | **Verified** in the client. Token is a 128-bit random value, per [README.md:326](../../README.md#L326) (**Documented only**) |
| Standard documents | Bundled into the portal build with `import.meta.glob("/documents/*")` and matched by file name. **These are public static files.** Anyone who loads the portal's JavaScript, even with an invalid token, can find the URLs. | **Verified** [Portal src/App.jsx:25-50]. Public reachability is **Inferred** from how Vite builds |
| Custom documents | The browser asks Storage for a 10-minute signed URL for `<token>/staff-documents/<id>/<file>`. This works without a staff login, so a Storage policy must allow anonymous signing on that path. | **Verified** [Portal src/App.jsx:1597-1700]. The policy itself is **Inferred** |
| Upload | The browser uploads directly to `portal-uploads/<token>/<item_id>/<uuid>-<file>`, then calls `portal_submit_checklist_upload(token, item_id, file_name, storage_path, mime, size)`. If that call fails, the browser deletes its upload. | **Verified** [Portal src/App.jsx:525-584] |
| Upload locks | Upload is disabled while a task is `needsReview` or `completed`. After *Request changes* the guest can upload again. The task holds one `uploaded_file_path`. | **Verified** [Portal src/App.jsx:1210-1460] |
| Guest's own uploads | Not shown back to the guest as downloadable files (`uploadedByGuest` rows are skipped). | **Verified** [Portal src/App.jsx:1619-1624] |
| Progress | The portal counts `needsReview` as fully done (`completed + needsReview`). The staff app counts it as half ([src/utils/portalRules.js:39-68](../../src/utils/portalRules.js#L39-L68)). **They disagree.** | **Verified** [Portal src/App.jsx:734-746] |
| Docs out of date | The portal's `docs/portal-supabase-integration.md` (dated June 2026) still says uploads and downloads are placeholders. That repo has an uncommitted edit to this file, which this audit did not touch. | **Verified** |

### B.4 Database, server functions and storage

| Object | What is known | Source |
|---|---|---|
| `portal_checklist_items`, `portal_documents` | Column names come from the code's selects and inserts. **The table definitions are not in either repository.** They cascade-delete with their booking. | **Documented only** [README.md:776-805](../../README.md#L776-L805) |
| Guest RPCs: `get_portal_record`, `portal_get_booking_reference`, `portal_get_checklist_item_response`, `portal_mark_checklist_item_ready`, `portal_unmark_checklist_item_ready`, `portal_submit_checklist_item_response`, `portal_submit_checklist_upload`, `portal_upload_path_is_allowed` | `security definer`, callable by `anon`. **Their bodies are not in either repository and could not be read.** Only a publishable key was available locally, and nothing was run against the live project. | **Documented only** [README.md:382-401](../../README.md#L382-L401) |
| `portal-uploads` bucket | Private, 10 MB limit, allowed types PDF, Word, Excel, PNG and JPEG. Guest access is limited to paths where `portal_upload_path_is_allowed(name)` is true. | **Documented only** [README.md:364-380](../../README.md#L364-L380) |
| Guest delete in Storage | The portal calls `storage.remove()` as `anon` to clean up a failed upload, so some anonymous delete is probably allowed under the token folder. **Whether a link holder can delete or overwrite other files under that folder, including staff documents, is unknown.** | **Inferred**. Must check before any signed file is stored there |
| Staff write policies | Optional SQL adds UPDATE and DELETE for `can_manage_bookings()`. It is unknown whether it was run. | [supabase/optional/20261028000310_portal_staff_write_policies.sql](../../supabase/optional/20261028000310_portal_staff_write_policies.sql) |

### B.5 Status model

`notStarted`, `waitingOnGuest`, `needsReview`, `completed` (the portal also knows `ready`). The guest moves a task to `needsReview` by uploading or confirming. Only staff move it to `completed`. Staff progress: completed = 1, needsReview = 0.5. A portal is complete only when every task is `completed` (`isPortalComplete`). **Verified** [portalRules.js](../../src/utils/portalRules.js).

### B.6 Email

The `portal-email` Edge Function sends welcome, task-assigned and reminder emails (7 days, 2 days, overdue) through Resend. Emails link to the portal and **never attach files**. Recipients are chosen by staff per booking (`portal_email_recipients`). The system was in Test mode on 2026-11-05. **Verified** [supabase/migrations/20261104000100_portal_email.sql](../../supabase/migrations/20261104000100_portal_email.sql), [docs/portal-email/SETUP.md](../portal-email/SETUP.md). No email is tied to a signing event, and no email address is linked to a signer identity.

### B.7 Backups, restore, deletion and retention

- **Verified:** manual backup version 2 includes `portal_checklist_items`, `portal_documents` and a **storage manifest that lists file names and paths only**. It does not include file contents ([src/utils/backupFormat.js:18-92](../../src/utils/backupFormat.js), [src/services/backupData.js](../../src/services/backupData.js)). Restored portal rows come back with email options off.
- **Documented only:** the Google Apps Script daily backup covers `bookings` only. Files in `portal-uploads` are **not backed up anywhere** by this system. Deleting a booking cascades its portal rows but leaves its files in Storage ([README.md:801](../../README.md#L801), [README.md:1444-1460](../../README.md#L1444-L1460)). Note that the README's coverage list was written before backup version 2 and still says the portal tables are excluded.
- **No retention rule exists** for portal files, uploads or removed uploads. Nothing expires or is deleted on a schedule.
- **Consequence for signing:** a signed contract kept only in `portal-uploads` would have no backup, could be orphaned when its booking is deleted, and could become unreachable if the token-based path changes.

---

## C. Document inventory

All files are in `documents/`. The copies in both repositories are byte-identical (checked by MD5). The folder is git-ignored in both. Page renders were inspected for every file with a signature block and for the scanned files.

| # | File (catalog title) | Purpose | Apparent signer | Fields on the page | Format | Signing complexity | Open issues |
|---|---|---|---|---|---|---|---|
| 1 | 2026 Toah Nipi CRC Guest Policy Information doc-rev.8.26.pdf (Guest Policy Information) | Campus rules. Says **"All guests must sign a Liability Release Form"** | "Individual Guest **or** Guest Group Leader" | Print name, signature, date (page 3). Statement: read, will comply, **will provide a copy to each group member** | Text PDF, 3 pages, Letter, Google Docs export, not fillable | Low: one signer, acknowledgment | Leader also promises to give every member a copy. **Includes Wi-Fi passwords, including the admin network**, in a file served publicly by the portal |
| 2 | 2026 Toah Nipi CRC Guest House Policy Information-rev.8.26.pdf | Guest House rules and fees ($969 for 2 nights, plus per-person charges) | "Individual or Guest Group Leader" | Print name, signature, date (page 2) | Text PDF, 2 pages, **A4** | Low | Contains fee terms, so it is more than a policy note. Includes the Guest House Wi-Fi password |
| 3 | 2026 Toah Nipi CRC InterVarsity Guest House Policy Information-rev.8.26.pdf | IV version of #2 plus extra IV clean-up tasks | "IV Guest/Group Leader" | Name, signature, date (page 2) | Text PDF, 2 pages, A4 | Low | Same Wi-Fi issue |
| 4 | 2026 Toah Nipi CRC InterVarsity Policy Information Form-rev. 8.26.docx | IV policies. "IV Guest Group leader signs this policy document and distributes a copy" | IV Guest/Group Leader | Name of group, signature, date (as text lines, no Word form controls) | **Word file**, not PDF | Low, but must be turned into a PDF first | Portal opens it as a .docx download. Exact layout not rendered |
| 5 | 2026 InterVarsity Guest Clean-Up Procedures-rev.8.26.pdf | Clean-up steps | None on the page | **No signature block** | Text PDF, 1 page, A4 | n/a | **Task #3 says "Sign and return" this document, but it has nothing to sign** |
| 6 | 2026 TNCRC Guest Clean-Up Procedures.pdf | Clean-up steps (general) | None | None | Text PDF, 1 page, A4 | n/a | Information only |
| 7 | 2026 Toah Nipi CRC Water Safety Policies.pdf | Swimming and boating rules, ages 12, 14 and 16 | None | None | Text PDF with logos, 1 page, A4 | n/a | Safety rules that involve minors. Mentioned for the release review (L-3), not something to sign |
| 8 | 2026 Detail of Comm Gen Liability Insurance from Terms and Conditions.pdf | Excerpt of the **contract's** insurance terms and a **one-way indemnity in capital letters**, including for Toah Nipi's own negligence | None (excerpt) | None | Text PDF, 1 page | n/a | Shows the contract has substantial liability terms. It is labeled "IV." while the Welcome sheet cites "Section VI" |
| 9 | 2026 IV Detail of Comm Gen Liability Insurance … .pdf | IV contract excerpt with a **mutual** indemnity | None | None | Text PDF, 1 page | n/a | The IV contract differs from the general contract, so there are at least two contract templates |
| 10 | Welcome & Reservation Information.pdf | Steps: "sign the contract and email or mail it back" within 14 days, deposit, COI, cancellation terms | None | None | Text PDF (Word export) | n/a | Describes the current paper or emailed contract process. Asks that the contract be "legibly signed" with current contact details |
| 11 | Welcome & Reservation Information for IV Groups.docx.pdf | IV version of #10 | None | None | Text PDF | n/a | Same |
| 12 | Sample COI Form.pdf | Example ACORD 25 insurance certificate | Issued by an insurer, not signed by a guest | n/a | **Scanned image**, no text layer | Not a signing candidate | It is a real third party's certificate, **only partly redacted**, with a handwritten signature, served publicly by the portal |
| 13 | TN Campus Map.pdf | Map | None | None | Illustrator PDF | n/a | n/a |
| 14 | Toah Nipi Hiking Trails Updated 4-2026.pdf | Trail map | None | None | Scanned image ("Print to PDF") | n/a | n/a |
| n/a | **Rental contract / Agreement** | The binding booking agreement | Group representative, with possible Toah Nipi countersignature | Unknown | **Not available** | Probably the highest | Uploaded per group as a custom document. Never seen in this audit |
| n/a | **Liability Release Form** | Individual waiver that "all guests must sign" | Each participant, or a parent or guardian for a minor | Unknown | **Not available** | High: one signer per person, minors, a sensitive waiver | Handled entirely outside the portal today |

**General PDF observations (Verified):** none of the 13 PDFs has form fields or signature fields. None is encrypted. Signature lines are drawn underscores, so the position for a signature has to be set per template; it cannot be detected from the file. Page sizes are mixed (Letter and A4). Every signature block is on the last page, so on a phone the signer has to scroll through the whole document first, which fits the "see the whole document" requirement.

---

## D. Questions already answered by the audit

You don't need to answer these again.

| Question | Answer | Evidence |
|---|---|---|
| Is there any existing e-signature, PDF filling, hashing or versioning? | No | Section A; both `package.json` files |
| How do guests "sign" today? | Download, sign outside the system, then upload a file to the matching task | Portal `App.jsx:525-584`; README:403-419 |
| Is a signed upload checked to be the right document or actually signed? | No. Any allowed file type is accepted, and staff check it by eye | Portal `validatePortalUpload` |
| Are documents linked to the tasks they satisfy? | No. Documents have no `item_id` from staff inserts | PortalAdminView:868-990 |
| Where does the contract come from? | It is uploaded per booking by staff as a custom document. It is not in the catalog | README:403-419; catalog |
| Is the Liability Release Form in the system? | No. Only leader confirmations (`liability-release-sent` and `-completed`) | PortalAdminView:316-327 |
| Which PDFs have signature blocks? | Guest Policy Info, Guest House Policy, IV Guest House Policy, plus the IV Policy Form (.docx) | Section C |
| Are any PDFs fillable or scanned? | None fillable. COI sample and hiking map are scanned; the rest are text | Section C |
| Who signs the policy forms? | One person: the group leader, or an individual guest who is the whole booking | Signature captions |
| Does any form need a countersignature or a signing order? | Not the policy forms. The contract is unknown | Section C |
| How is a guest identified? | Only by holding the portal token | Section B.3 |
| How is the staff reviewer identified? | Not at all for portal Confirm. One shared login | PortalAdminView:3995-4060 |
| Can a guest replace an upload? | Yes, after staff *Request changes*. The task keeps one file path | Portal `App.jsx:1220`; portalCorrections |
| Are uploaded files backed up? | No. Only their names and paths are in manual backup v2 | backupFormat.js |
| Do emails attach documents? | No. They only link to the portal | SETUP.md |
| Is there a retention or deletion schedule? | No | Section B.7 |
| Does the staff app need a new login system for signing? | Not for guests. For a staff countersignature, the shared login is a problem (see E-5) | B.2 |

---

## E. Remaining questions for you

### E.1 Decisions needed before implementation

**E-1. Which documents should be signed online in the first version?**
Why it matters: this sets the scope, the cost and the legal review. Each document needs a template, a signature position and its own review.
Choices: (a) contract only; (b) contract plus the three or four policy acknowledgments; (c) policy acknowledgments only, as a low-risk pilot; (d) everything, including individual releases.
Recommendation: **(b)**, or **(c)** if the contract is not yet ready for attorney review. Keep releases out of version 1 (see E-6).
**My answer:**

**E-2. Provider integration or in-house build?**
Why it matters: this decides most of the cost, the maintenance and the strength of the evidence. See [G.6](#g6-provider-versus-in-house).
Choices: (a) provider for everything; (b) provider for the contract, in-house for the policy acknowledgments; (c) in-house for everything.
Recommendation: **(a) or (b)**. Build in-house only for one-signer acknowledgments, and only if the cost of (a) is a problem.
**My answer:**

**E-3. What budget is acceptable, and how many signatures a year?**
Why it matters: provider API plans are priced by envelope volume, and embedded signing (signing inside the portal page) is often a higher tier. Examples checked on 2026-11-07 on vendor pages: DocuSign API Starter is $50/month with about 40 envelopes/month, and **embedded signing is listed only on the "Enhanced" contact-sales tier**. Dropbox Sign API Essentials is about $75/month for 50 requests/month, with a free test mode. Documenso Teams is $40/month with embedded signing; Documenso can also be self-hosted. Please supply: bookings per year, signed documents per booking, and a monthly or yearly ceiling.
Recommendation: count one envelope per booking for the contract plus one per acknowledgment. If yearly volume is under about 500, a mid-tier plan probably fits.
**My answer:**

**E-4. Who signs the contract for a group, and how is that person named?**
Why it matters: the signer must be identified before signing. Today the portal knows `bookings.contact_name` and `email`, plus staff-chosen email recipients, but none of these is a "signer".
Choices: (a) the booking contact by default, which staff can change before sending; (b) staff always enter the signer's name, title, organization and email per booking; (c) the guest names the signer in the portal (weakest).
Recommendation: **(a)**, with staff confirming the name, title and email before the request goes out.
**My answer:**

**E-5. Does Toah Nipi countersign contracts, and who?**
Why it matters: a countersignature adds a second signer, a signing order and a staff identity. With one shared login, the app cannot show which staff member signed.
Choices: (a) no countersignature; (b) one named signer, such as the director, signs through the provider by email, not through the shared login; (c) the countersignature stays on paper.
Recommendation: **(b)** if a countersignature is needed. Do not build staff signing on the shared login.
**My answer:**

**E-6. Should individual participant Liability Releases be signed through the portal?**
Why it matters: this is the biggest change in scope. It means one signer per participant, possibly hundreds per group, people who are not portal users, and **parent or guardian signatures for minors**, which New Hampshire courts treat with suspicion (see H.3). It needs the actual form, which this audit did not have.
Choices: (a) not in version 1; keep the leader's "sent" and "completed" confirmations; (b) a later phase with its own legal review; (c) version 1.
Recommendation: **(a) now, then decide (b) after the attorney answers L-3.**
**My answer:**

**E-7. How must a signer prove who they are?**
Why it matters: the portal link alone is shared among group leaders. Each extra check adds evidence and some friction. None of them *proves* identity on its own (see H.2).
Choices: (a) portal link only; (b) the request goes to the signer's email, and the signer must use that email's link or a one-time code; (c) (b) plus SMS; (d) an ID check through the provider, which costs extra.
Recommendation: **(b)** for the contract and the acknowledgments.
**My answer:**

**E-8. What should happen to the print, sign and upload path once online signing exists?**
Why it matters: the law requires a paper option to stay available in some cases (H.1), and some groups will want paper anyway.
Choices: (a) keep both; the guest chooses per document; (b) online by default, with paper on request to staff; (c) online only.
Recommendation: **(b)**. Keep upload as a staff-enabled fallback, and label paper-signed uploads differently from online signatures.
**My answer:**

**E-9. Typed or drawn signatures?**
Why it matters: neither is legally stronger in itself. Under both laws, what counts is intent and attribution (H.2). Drawn signatures are harder on phones and get no better evidence.
Choices: (a) typed name plus a "Sign" button; (b) typed or drawn, signer's choice; (c) drawn only.
Recommendation: **(a) or (b)**, whichever the provider offers by default.
**My answer:**

**E-10. Fix the IV Clean-Up task now?**
Why it matters: *Sign and return Guest Clean-Up Procedures (IV guests)* points at a document with no signature block.
Choices: (a) rename it to "Read …" and change it to a confirm-only task; (b) add a signature block to the PDF; (c) leave it for now.
Recommendation: **(a)**, as a separate small fix that does not depend on signing.
**My answer:**

### E.2 Decisions that can reasonably wait

**E-11. Should a staff document that changes after signing go back out for signature automatically?**
Why it matters: any replacement must start a new version and a new signature (G.4). The question is whether staff are prompted, or a new request goes out automatically.
Recommendation: staff choose, after a warning that says which signatures will no longer match.
**My answer:**

**E-12. How long are signed documents and their evidence kept, and who may delete them?**
Why it matters: today nothing is deleted and nothing is backed up. This is a business decision informed by L-5. No period is suggested here.
**My answer:**

**E-13. Should a signing request expire, and can the signer decline?**
Recommendation: expire at the task's due date plus a grace period. Offer "Decline / ask staff a question" so a signer can raise problems without signing.
**My answer:**

**E-14. Should signing completion set the booking's contract-returned date or status?**
Why it matters: the audit fix deliberately kept portal progress separate from booking status.
Recommendation: show signing status in Portal Admin only, and leave booking status alone, as decided earlier.
**My answer:**

**E-15. Should completed copies be emailed?**
Why it matters: today emails never attach files. Providers usually email the completed copy to every signer by default.
Choices: (a) allow the provider's completion email with the PDF; (b) send a portal link only.
Recommendation: **(a)** for the contract. It gives the signer a copy they keep without any action.
**My answer:**

### E.3 Questions for the attorney, insurer or another responsible person

Please give this list to the right person. Record who answered and when.

**L-1. Rental contract (attorney).** May it be signed electronically by the group's representative? Is a Toah Nipi countersignature required for it to take effect? What evidence of the signer's authority to bind the organization is enough (a title, a statement, or a resolution)? Do the IV and general versions need different treatment?
**My answer / who / date:**

**L-2. Policy acknowledgments (attorney).** Are the read-and-comply forms (C #1 to #4) meant to be binding, or are they notice only? Is a typed-name acknowledgment acceptable? Should the Guest House form (#2), which contains fees, be treated as part of the contract?
**My answer / who / date:**

**L-3. Liability Release and minors (attorney and insurer).** Please review the current Liability Release Form. Is it enforceable at all? Can a parent or guardian sign for a minor under New Hampshire law? Federal courts applying New Hampshire law have refused to enforce parent-signed releases (H.3). Is electronic signing acceptable to the insurer for releases?
**My answer / who / date:**

**L-4. Consumer disclosure (attorney).** For individuals and families who book for personal reasons, such as Personal Retreats, family camps and Guest House stays, does any law require information to be given to them in writing? If so, the E-SIGN consumer-consent disclosures in 15 U.S.C. 7001(c) apply. Please approve the consent and paper-option wording either way.
**My answer / who / date:**

**L-5. Retention (attorney and insurer).** How long must signed contracts, releases, acknowledgments and their signing evidence be kept? Does the insurer require anything specific?
**My answer / who / date:**

**L-6. Insurer on e-signed contracts (insurer).** Does the liability carrier accept electronically signed contracts, indemnity terms and releases? Does it have requirements for the evidence?
**My answer / who / date:**

**L-7. Publicly served documents (director or office).** The portal currently serves the policy PDFs as public files. Two problems: the Guest Policy file shows **admin Wi-Fi credentials**, and the sample COI shows a **real third party's partly redacted details**. Should these be revised, or moved behind the token? This is not a legal question, but it affects what goes into signing templates.
**My answer / who / date:**

---

## F. Proposed workflow

Proposed only. None of this exists.

### F.1 Staff: preparing a document

1. Staff choose a **signing template** (for example "2026 Guest Policy Acknowledgment") or upload a booking-specific PDF (the contract).
2. The system freezes that PDF as a **document version**: a private stored copy and a SHA-256 fingerprint. A version can never be edited, only replaced by a new version.
3. Staff choose the **signer(s)**: name, email, role, and title or organization when signing for one. They also choose a **signing order** if there is a countersigner.
4. Staff link the version to a task (for example *Sign and return contract*), so the task and the document are one thing for the guest.
5. Staff click **Send for signature**. The provider envelope is created by a server function, never from the browser, and the provider emails the signer if E-7(b) is chosen.

### F.2 Guest: signing

1. The guest opens the portal. The task shows **Review and sign** next to the exact document.
2. **Consent step** (once per signer): the approved electronic-records consent (L-4), the paper option, and how to download. The signer agrees, or chooses paper.
3. **Identity step:** the signer confirms the code from their email, per E-7.
4. **Review:** the whole document is shown, with download available before signing.
5. **Sign:** the signer types their name (or draws it, per E-9) and checks a box such as "I agree that my typed name is my signature on this document", with wording approved by the attorney.
6. The server records the evidence, seals the PDF and adds a certificate page. The task moves to **Signed**, a new status that is separate from `needsReview`.
7. The signer gets a **download of the completed copy** right away, and by email if E-15(a) is chosen.

### F.3 Staff: review and completion

- A signed task appears in Portal Admin as **Signed, awaiting countersignature** or **Signed, complete**. Staff can open the completed PDF and its certificate.
- If staff need to check anything, such as whether the signer has authority, they mark it complete. A signature cannot be "rejected" back into an editable state. If it is wrong, staff **void** it and send a new request, and both records are kept.

### F.4 Later retrieval

- Signed copies stay visible in the portal Documents tab for the life of the booking. After that, they are available from staff on request, per E-12.
- Staff can find any completed record by booking, and it stays available after the booking is deleted or its token changes, because signed records are keyed by IDs, not by the token.

### F.5 Living alongside print, sign and upload

- Each signing task offers **Sign online**, or **Print and upload instead** when staff allow it (E-8).
- An uploaded paper signature keeps today's flow (`needsReview`, then staff Confirm) and is labeled **Paper copy uploaded**. It is never shown as an electronic signature.
- If a guest chooses paper, the online request for that version is cancelled, and the reverse, so one task can never hold two different "signed" copies.

---

## G. Technical gaps and security requirements

### G.1 What protects things today and what does not

| Protection | Today |
|---|---|
| A token reaches only its own booking | **Documented**: the RPCs look up the booking from the token. Bodies not seen, so **unverified** |
| A guest cannot mark a task `completed` | **Verified** in the client: guests only call RPCs that set `needsReview`. Server-side enforcement is **unverified** |
| Upload paths limited to the guest's own token folder | **Documented** (`portal_upload_path_is_allowed`). **Unverified** |
| A staff document cannot be changed by a guest | **Unknown.** Anonymous delete appears to be allowed for cleanup |
| Files are fixed once uploaded | No: no hashing, and replacement is possible |
| Staff actions are traceable to a person | No |
| Files are backed up | No |

### G.2 Changes likely needed

**Database (staff repository migrations):**

- `signing_documents`: one row per template or per booking document; title and kind.
- `signing_document_versions`: frozen file path in a **separate private bucket**, SHA-256, page count, created by and when. Never updated, only inserted.
- `signing_requests`: booking, version, task, signer (name, email, role, organization, title), order, status (`draft`, `sent`, `viewed`, `signed`, `completed`, `declined`, `voided`, `expired`), provider envelope ID, timestamps.
- `signing_events`: an append-only log (consent, code sent, code passed, viewed, signed, sealed, downloaded, voided), with the time, IP address, browser and actor. `insert` only, and no `update` or `delete` policy for anyone.
- `signing_completed_records`: completed PDF path, its SHA-256, certificate path, and the provider's audit file, if any.
- A link from `portal_checklist_items` to `signing_requests`, and a new task status or a derived "Signed" label.

**Server (Edge Functions, staff repository):**

- `signing-create` (staff only; checks `can_manage_bookings()`): freezes the version, creates the provider envelope, stores the IDs.
- `signing-session` (guest): takes the portal token and request ID. It checks the token's booking owns the request, and that the request is `sent` and not expired or voided. It returns an embedded signing URL or a provider redirect.
- `signing-webhook` (provider to us): **checks the provider's signature on the webhook**, downloads the completed PDF and certificate, re-checks the hash, stores the files, and sets the status. **This is the only path that can mark something signed.**
- `signing-download` (guest or staff): returns a short-lived URL for a completed record after the same ownership check.

**Guest portal:** a Review and sign UI, a consent screen, a completed-copy download, a "Signed" status, and the progress rule fixed to match the staff app (0.5 for review).

**Staff app:** Prepare and Send, signer entry, status and void, completed-record viewer, and a signing evidence view.

**Storage:** a new private bucket (for example `signed-records`) with **no `anon` policies at all** and staff **read only**. Writes come only from the service role inside the Edge Functions.

### G.3 How the design stops the three named attacks

| Attack | Proposed prevention |
|---|---|
| **A guest signs another booking's document** | The guest never sends a booking ID. `signing-session` finds the booking from the token, then requires `signing_requests.booking_id` to equal it. With a provider, the signer also has to pass the email code tied to that request. Request IDs are random UUIDs. |
| **A client forges completion** | No browser-callable function can set `signed` or `completed`. Status changes only in `signing-webhook` after it checks the webhook signature and re-downloads the document from the provider, or in the in-house server signing step. There are no `anon` update rights on signing tables. Staff "complete" is a separate, logged step. |
| **A replacement PDF inherits an earlier signature** | Signatures belong to a **version**, not to a document title or task. A replacement creates a new version with a new hash, voids every open request on the old version, and records `voided` events. A completed record stores the version hash it was signed against, and the viewer shows a mismatch whenever the current version differs. |

Other protections:

- Signed files never live under a token-named folder, so token rotation, Replace restore and guest deletes cannot touch them.
- Booking deletion must not cascade-delete signing records. Use `restrict`, or archive first.
- Rate-limit the code and session endpoints.
- Signing links and codes expire.
- Portal tokens are never logged in signing events.

### G.4 Versioning rules

- A version is immutable once any request against it has been sent.
- Staff "Replace" means: create version n+1, void the open requests on version n with a reason, and offer to resend.
- Completed records on version n stay valid **for version n**. Staff decide whether to ask for a new signature (E-11).

### G.5 Backups and restore

- Add the signing tables to backup version 3. Restore must never overwrite or delete existing signing events or completed records (insert missing only, like today's Merge).
- **Completed PDFs need a real file backup.** The current system copies no file contents. Options: a scheduled export of `signed-records` to Google Drive alongside the Apps Script backups, or keeping the provider's copy as the second copy. Decide with E-12.
- Replace restore must refuse to run when signing records exist, or must leave them untouched.

### G.6 Provider versus in-house

| Factor | Provider (DocuSign, Dropbox Sign, Documenso, etc.) | In-house |
|---|---|---|
| Guest experience | Provider screen, embedded or redirected. Embedding is often a higher tier | Fully native in the portal |
| Staff preparation | Place fields in the provider UI or by template IDs | We would build field placement, because the PDFs have no fields |
| Identity | Email-link and code checks built in. SMS and ID checks available as paid extras | We would build email codes through Resend and the rate limits |
| Evidence | Certificate of completion, audit trail and tamper seal are standard (listed on DocuSign's and Dropbox Sign's pricing pages) | We would build a hash chain, a certificate page and a PDF seal. A seal that viewers trust needs a certificate, at extra cost |
| PDF handling | Provider renders, flattens and seals | We would add pdf-lib or similar, and handle A4 and Letter, phones and accessibility |
| Security | A vendor holds signer data. We must check webhooks | Every part is our code to secure and maintain |
| Ongoing cost | Subscription. Embedded tiers can cost far more | No fees, but developer time and our liability for bugs |
| Dependency | Outage, price or vendor change. We must keep our own copies | None outside Supabase |

**Inferred conclusion:** for contracts and releases, a provider's evidence and independence are worth the cost. For one-signer acknowledgments, in-house is workable if G.2 and G.3 are fully built.

---

## H. Legal review and sources

Researched 2026-11-07 from primary sources. These are summaries for review, not conclusions about Toah Nipi's documents.

### H.1 What applies

**Federal E-SIGN Act, 15 U.S.C. 7001 to 7006** (applies to transactions in or affecting interstate commerce; Toah Nipi hosts out-of-state groups, including InterVarsity):

- **7001(a):** a signature, contract or record may not be denied legal effect *solely* because it is electronic.
- **7001(b)(2):** nobody is required to use or accept electronic records or signatures. *Implication: keep a paper path (E-8).*
- **7001(c), consumer disclosures:** these apply **only** when a statute, regulation or other rule of law requires information to be given to a **consumer** in **writing**. A consumer is an individual acquiring goods or services mainly for personal, family or household use (7006(1)). Then the consumer must affirmatively consent after a clear statement covering: the paper option; the right to withdraw consent and its consequences or fees; the scope of the consent; how to withdraw and update contact details; how to get a paper copy and any fee; and the hardware and software needed. The consumer must also consent in a way that "reasonably demonstrates" they can open the format used. *Group bookings by organizations are probably not consumer transactions. Individual and family bookings may be. Whether any writing requirement applies is L-4.* Under 7001(c)(3), a contract is not invalid *solely* because the "reasonably demonstrates" step was missed.
- **7001(d) and (e):** where a law requires a record to be kept or a contract to be in writing, the electronic record must accurately reflect the information and stay accessible and accurately reproducible. Its effect "may be denied" if it cannot be retained and reproduced by everyone entitled to it. *Implication: give every signer a downloadable completed copy, and keep our own.*
- **7001(g):** notarization can be done electronically, with the notary's own requirements. *Nothing in these documents appears to need notarizing.*
- **7003 exceptions** (wills, family law, most of the UCC, court documents, certain notices) do not appear to cover these documents.

**New Hampshire UETA, RSA 294-E** (effective Sept. 11, 2001; sections used here have no later amendments):

- **294-E:5 II:** the Act applies only where **each party has agreed** to conduct the transaction electronically. Agreement is judged from context and conduct. **294-E:5 III:** a party may refuse to do other transactions electronically, and that right cannot be waived. *Implication: record the consent step, and honor paper requests.*
- **294-E:7:** an electronic record satisfies a writing requirement, and an electronic signature satisfies a signature requirement.
- **294-E:8 I and III:** where information must be given in writing, the electronic record must be **capable of retention by the recipient**. If the sender stops the recipient from printing or storing it, the record **is not enforceable against the recipient**. *Implication: never block download or print, before or after signing.*
- **294-E:9:** a signature is attributable to a person if it was their act. This "may be shown in any manner, including … the efficacy of any security procedure". Its effect depends on context. *Implication: the strength of the identity steps (E-7) is what proves attribution.*
- **294-E:10:** rules for changes and errors where the parties agreed a security procedure. Individuals in automated transactions get a right to correct their own errors. *Implication: show a review step before the final signature.*
- **294-E:12:** retention is satisfied by a record that accurately reflects the final form and stays accessible and reproducible. A third party, such as a provider, may be used.
- **294-E:13:** evidence may not be excluded *solely* because it is electronic.
- **294-E:3 V:** other substantive law still applies. *E-signature law decides whether the signature counts. It does not decide whether a waiver, indemnity or contract term is enforceable.*

### H.2 What each identity measure contributes

| Measure | Contributes | Limits |
|---|---|---|
| Portal token link | Shows the person had a link sent to the group | The link is shared among leaders by design, so it identifies a group, not a person |
| Email link or one-time code | Ties the act to someone who controlled that inbox at that time | Shared or compromised inboxes. Shows control of the inbox, not identity |
| SMS code | A second channel | Same limits, plus SIM swap |
| Typed name | Shows intent to sign when paired with clear wording | Says nothing about who typed it |
| Drawn signature | The same as a typed name legally, under 7006(5) and 294-E:2 VIII | Does not identify the signer, and is harder on phones |
| IP address, device and time | Supporting context | Easy to spoof or share. Weak on its own |
| ID document check | Strongest practical check | Cost and friction. Probably more than these documents need |

Attribution is proven from the whole record (294-E:9). No single measure is conclusive.

### H.3 Waivers and minors (needs an attorney)

- Electronic-signature law does not make a release enforceable. Under New Hampshire common law, exculpatory contracts are disfavored and strictly construed.
- **Secondary sources report** that the New Hampshire Supreme Court has not squarely decided whether a parent can release a minor's future claims. They also report that federal courts applying New Hampshire law have refused to enforce parent-signed releases, including *Lovering v. Brewster Academy* (D.N.H. 2024), as summarized by a secondary source. **These summaries were not checked against the opinions.** The attorney should confirm the current law before any release involving minors goes online (L-3).
- The general contract's indemnity (C #8), in capitals and covering Toah Nipi's own negligence, is also a substantive term for the attorney. It is not an e-signature issue.

### H.4 Authority to sign for an organization

E-signature law does not settle agency. The record should capture the signer's statement of title and authority, and the attorney should say whether that is enough (L-1).

### H.5 Sources (accessed 2026-11-07)

- 15 U.S.C. 7001: <https://www.govinfo.gov/content/pkg/USCODE-2024-title15/html/USCODE-2024-title15-chap96-subchapI-sec7001.htm>
- 15 U.S.C. 7003: <https://www.govinfo.gov/content/pkg/USCODE-2024-title15/html/USCODE-2024-title15-chap96-subchapI-sec7003.htm>
- 15 U.S.C. 7006: <https://www.govinfo.gov/content/pkg/USCODE-2024-title15/html/USCODE-2024-title15-chap96-subchapI-sec7006.htm>
- Pub. L. 106-229 (E-SIGN as enacted): <https://www.congress.gov/106/plaws/publ229/PLAW-106publ229.htm>
- RSA 294-E (full chapter): <https://gc.nh.gov/rsa/html/XXVII/294-E/294-E-mrg.htm>; chapter index: <https://gencourt.state.nh.us/rsa/html/NHTOC/NHTOC-XXVII-294-E.htm>
- Minors and releases (secondary, to be verified): <https://www.lawyersnh.com/wp-content/uploads/2019/08/Mommy-Whats-an-Exculpatory-Contract-NH-TBN-Journal-Article-2019.pdf>; summary of *Lovering v. Brewster Academy*: <https://www.studicata.com/summaries/united-states-district-court-district-of-new-hampshire/lovering-v-brewster-acad-2024-acxl18>
- Vendor pricing, from official pages only: DocuSign <https://ecom.docusign.com/plans-and-pricing/esignature> and <https://ecom.docusign.com/plans-and-pricing/developer>; Dropbox Sign <https://sign.dropbox.com/products/dropbox-sign-api/pricing>; Documenso <https://documenso.com/pricing> and <https://documenso.com/self-hosted>. Notes: the Dropbox Sign page showed mixed figures across its billing toggle, so the tier mapping is unconfirmed. BoldSign's API pricing page returned 404 and was not used. Re-check prices before buying.

### H.6 For professional review

Send the attorney and insurer: the rental contract templates (general and IV), the Liability Release Form, documents C #1 to #4, the proposed consent and signing wording (to be drafted after E is answered), and questions L-1 to L-6.

---

## I. Suggested implementation phases

### Phase 0: Preparation (no signing code)

- Answer section E. Get the L answers in writing.
- Collect the contract templates and the release form.
- **Read the live definitions** of the guest RPCs and the `portal-uploads` Storage policies, and save them to the repository. This was blocked in this audit. It is needed to confirm G.1.
- Small separate fixes: E-10 (IV clean-up wording), the portal progress mismatch, and L-7 (public Wi-Fi credentials and the COI sample).
- **Check:** the RPC bodies are in the repository and reviewed. A test confirms a token cannot read, delete or overwrite another token's files, or its own staff documents.

### Phase 1: First version (recommended scope)

The contract, plus the policy acknowledgments if E-1 is (b). Through the chosen provider, with an email-verified signer, the server-side status flow and the protected record bucket.

**Acceptance checks:**

1. A token for booking A cannot open, sign or download any request for booking B, even with its ID (a server test).
2. No `anon` or ordinary `authenticated` call can set a request to `signed` or `completed`, or write to `signing_events` or `signed-records`.
3. A webhook with a bad signature, or for an unknown envelope, is rejected and logged.
4. Replacing a version voids its open requests, and the old completed record still shows the old hash.
5. The completed PDF's SHA-256 matches the stored value. Changing one byte is detected.
6. The signer can download the completed copy on a phone immediately and again a week later.
7. Choosing paper cancels the online request, and the reverse.
8. Deleting the booking, rotating its token, or running a Merge or Replace restore leaves the signing records and files intact.
9. Backups include the signing tables and a copy of the completed files.

### Phase 2: Optional

In-house acknowledgment signing (if E-2 is (b)), automatic resend after a replacement, and reminder emails for signing tasks.

### Phase 3: Only after L-3

Individual participant releases: per-participant links, guardian signing, roster matching, and leader progress counts.

### Before relying on it for real signatures

Separate from the development work:

- [ ] Attorney sign-off on L-1 to L-5 and on the consent and signing wording.
- [ ] Insurer answer on L-6.
- [ ] Provider contract and data-processing terms reviewed. Retention set in the provider to match E-12.
- [ ] A staff procedure for void, resend, paper requests and consent withdrawal.
- [ ] A test run with fake bookings, in the provider's sandbox or test mode. Sandbox envelopes are not legally valid.

---

## Appendix: what was checked and what was not

**Checked:**

- Staff repository: README, `src/pages/PortalAdminView.jsx`, `src/services/portalCorrections.js`, `src/utils/portalRules.js`, `src/utils/backupFormat.js`, `src/services/backupData.js`, `supabase/migrations/*`, `supabase/optional/*`, `docs/portal-email/SETUP.md`, the audit docs, and `package.json`.
- Portal repository: `src/App.jsx`, `src/services/portalService.js`, `src/lib/supabaseClient.js`, `docs/portal-supabase-integration.md`, and `package.json`.
- All 13 PDFs and the 1 .docx in `documents/` of both repositories. They are identical copies.
- Searched for contract or release files in `Toah_Nipi_Website` and `Guest_Booking_Form`. Only unrelated PDFs were found (a blog post and a staff application).

**Not checked, or blocked:**

- The live definitions of the guest RPCs, the portal tables and the Storage policies. They are not in either repository, only a publishable key was available, and nothing was run against production.
- The rental contract, the Liability Release Form, and any signed copies already uploaded.
- The full text of the court opinions in H.3.
- BoldSign pricing (page not found). Per-tier details of Dropbox Sign.
- The Google Apps Script backup project, which is outside these repositories.

No production data, settings or emails were touched. No tokens, credentials or guest details are reproduced here. The Wi-Fi credentials and the COI details are described but not copied.
