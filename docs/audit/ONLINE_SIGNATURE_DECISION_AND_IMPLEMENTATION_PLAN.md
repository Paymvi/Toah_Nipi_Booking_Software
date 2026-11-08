# Online Signing in the Guest Portal: Plan

**Status (2026-11-08): version 1 is built and tested locally, not deployed, and off for every booking.** Setup, tests, deployment and the activation checklist: [docs/portal-signing/SETUP.md](../portal-signing/SETUP.md). Nothing has been purchased or sent.

- **Revised:** 2026-11-07, to a much smaller scope.
- **Earlier version:** the previous, larger plan is kept unchanged at [archive/ONLINE_SIGNATURE_DECISION_AND_IMPLEMENTATION_PLAN_v1_detailed_2026-11-07.md](archive/ONLINE_SIGNATURE_DECISION_AND_IMPLEMENTATION_PLAN_v1_detailed_2026-11-07.md).
- **Original audit:** [ONLINE_SIGNATURE_AUDIT_AND_QUESTIONS.md](ONLINE_SIGNATURE_AUDIT_AND_QUESTIONS.md).
- **Live database security rules** (reference only): [ONLINE_SIGNATURE_LIVE_SCHEMA_2026-11-07.sql](ONLINE_SIGNATURE_LIVE_SCHEMA_2026-11-07.sql).

**Not legal advice.** This plan describes what the software would do. Whether a particular contract is enforceable is for Toah Nipi's lawyer.

---

## 1. The idea in one paragraph

Today a guest downloads a PDF, prints it, signs it and uploads a scan. Instead:

1. The guest opens the same PDF in the portal.
2. They type their name (or draw a signature) and tick that they agree to sign electronically.
3. They click **Sign document**.
4. The server saves a signed copy of the PDF, with a signature page added at the end, and gives the guest a download.
5. The task goes to **Needs Review**, and staff confirm it exactly as they confirm an upload today.

Paper upload stays available beside it. No outside signing company, no new accounts, no new emails.

---

## 2. What the guest and staff see

**Staff (Portal Admin, on the booking):**

1. Upload the PDF to the booking as they already do for custom documents. For a standard form, upload the standard PDF file.
2. On the task (for example *Sign and return contract*), choose **Sign online: \<that document\>**. That's the only new setting.
3. When the guest signs, the task shows **Needs Review – signed online**. Staff open the signed PDF, see who signed and when, and click the existing **Confirm**. **Request changes** works as it does today. The earlier signed copy is kept, and the guest can sign again.

**Guest (portal):**

1. On the task: **Review and sign**, or, as today, **Upload a signed copy instead**.
2. The document opens. The guest can read and download it.
3. They fill in a short form:
   - full name;
   - title and organization, if signing for a group;
   - **Type** (default) or **Draw** signature.
4. They tick two boxes, with wording to be approved by the lawyer:
   - "I agree to sign this document electronically, and that my typed or drawn signature has the same effect as a handwritten one."
   - Only when signing for a group: "I am authorized to sign for \<organization\>."
5. **Sign document**, then **Signed. Download your copy.** The signed copy also stays in the portal's Documents tab.

---

## 3. What the signed record contains (behind the scenes)

For each signature the system keeps:

- **The exact original PDF the guest reviewed.** A separate copy is saved at signing, so deleting or replacing the staff document later can't change it.
- **The signed PDF:** the original pages plus one added signature page. That page shows:
  - the document title and page count;
  - the signature (typed or drawn);
  - name, title and organization;
  - the date and time;
  - the exact agreement wording that was ticked;
  - a fingerprint (SHA-256) of the original file.
- **A database row** holding:
  - the signer details as entered;
  - typed or drawn;
  - the time;
  - the agreement wording used;
  - both files' fingerprints;
  - the browser's IP address and browser name;
  - which booking and task it belongs to.

Only the server writes these. Nobody can edit or delete them through the portal or the staff app.

---

## 4. Signature placement

| Option | Effort | Fit for our PDFs |
| --- | --- | --- |
| Fixed positions on the standard forms | Measure the signature line on each form, again every time a form is revised | Only the 3 forms with signature lines; doesn't help the contract |
| Staff draw a rectangle on the PDF | A page viewer with drag-to-place in the staff app, plus storing positions | Works for anything, but it's the most code |
| **Add a signature page at the end** | No setup per document | **Works for every PDF**: Letter or A4, standard forms, the contract, and the IV Word form once exported to PDF |

**Recommendation: add a signature page.** It's the least complicated option and needs nothing from staff per document.

The page says it is the signature for the document above (title and page count), so the blank signature line inside the original isn't a problem. **Ask the lawyer (Q-2) whether that's acceptable for the contract.** If it isn't, fixed positions can be added later for just the contract.

The IV Policy Information Form is a Word file. Staff save it as PDF and upload that PDF to be signed.

---

## 5. Legal check

Sources read on 2026-11-07:

- New Hampshire's Uniform Electronic Transactions Act, RSA 294-E. The sections used here are unchanged since 2001.
- The federal E-SIGN Act, 15 U.S.C. §§7001, 7002 and 7006.

Both say the same things that matter here. New Hampshire's version controls state-law questions (§7002(a)).

### 5.1 Requirements that apply to these documents

| Rule | Source | How the plan meets it |
| --- | --- | --- |
| A signature or contract can't be refused **solely** because it is electronic | RSA 294-E:7; §7001(a) | — |
| A typed name or a drawing both count, if made **"with the intent to sign"** | 294-E:2 VIII; §7006(5) | Name plus an explicit **Sign document** click after the agreement box |
| The law applies only where the parties **agreed** to do it electronically (judged from context and conduct). Anyone may refuse to do the next transaction electronically | 294-E:5 II–III; §7001(b)(2) | The agreement checkbox, plus paper upload always available |
| If a law requires information to be given **in writing**, the electronic copy must be one the person can keep. If we stop them saving or printing it, it **isn't enforceable against them** | 294-E:8 I, III | Download before and after signing; nothing blocks printing |
| A signature belongs to a person if it was their act. That can be shown **"in any manner"**, judged from the circumstances | 294-E:9 | The record in section 3, plus staff review. See section 6 |
| Where an individual deals with an automated system, they can undo an error if there was **no chance to prevent or correct it** | 294-E:10 II | The guest sees the filled-in details and the whole document before clicking Sign |
| Keeping records electronically is fine if they stay accurate and can be reproduced later | 294-E:12 I | Stored files, fingerprints and backups (section 9) |

**What the law does not require:**

- **No specific identity check.** The statute does not require an email code, SMS, ID check or a signing provider.
- **No cryptographic PDF certificate.**
- **No particular wording.**

### 5.2 The federal consumer-disclosure rule: does it apply?

E-SIGN §7001(c) requires a longer disclosure and consent step: paper option, how to withdraw, how to get copies, what software is needed, and consent that shows the person can open the files. It applies **only** when *"a statute, regulation, or other rule of law requires that information relating to a transaction … be provided or made available to a consumer in writing."* A "consumer" is an individual buying for **personal, family or household** use (§7006(1)).

- **Church, school, ministry and IV groups:** an organization is not a "consumer". **Probably doesn't apply** (Inferred).
- **Personal retreats, family camps, Guest House stays and family reunions** may be consumer transactions. The rule applies to them **only if some law requires written information for that kind of booking.** None was identified. That is question **Q-4** for the lawyer.

If the answer is yes, those bookings need the fuller disclosure screen before signing. A single checkbox would not be enough. If a consumer's consent step is missed, the contract still isn't invalid on that ground alone (§7001(c)(3)), but the written-information requirement may not be met.

### 5.3 Depends on the real documents, booking type or insurer

- Whether the contract's terms hold up, including the indemnity in the insurance section, and whether the signer has authority for the organization. **Electronic-signature law doesn't decide these.**
- Whether Toah Nipi countersigns the contract (Q-1).
- Whether the insurer has rules for electronically signed contracts (Q-5).
- How long records must be kept (Q-6).

---

## 6. Do we need email verification?

**The tradeoff:**

- The portal link is shared among a group's leaders by design. So a signature made through it shows that **someone with the group's link** typed this name and clicked Sign. It **doesn't show that the named person did it.**
- The booking's email address isn't "verified" just because it's on the booking.
- An emailed code would show that **someone who controls that inbox** signed. That's stronger, but it still doesn't prove identity or authority.

**Is it required?**

- **By law:** no (section 5.1).
- **By the insurer:** unknown (Q-5).
- **By a careful process:** optional.

**Recommendation for version 1: no email codes.** The reasons:

- These are contracts and rule acknowledgments with groups Toah Nipi already deals with directly.
- Staff review every signed task before confirming it.
- The paper route had the same weakness: anyone could upload a scan.

This is **weaker evidence of who signed** than an email code would give. If the contract is ever disputed, Toah Nipi would rely on the surrounding circumstances (294-E:9): the booking relationship, the name entered, the timing, the group's conduct afterward, and staff's own confirmation.

If the lawyer or insurer wants more, the smallest addition is a one-time code emailed to an address that **staff** enter for the signer. It fits on top of this design without redesigning it.

---

## 7. Keep / simplify / defer (compared with the previous plan)

| Previous plan | Now | Why |
| --- | --- | --- |
| Signing in our own portal, no provider | **Keep** | It's what you want, at no new fees. A provider stays a fallback only if the insurer or lawyer asks |
| Explicit agreement, intent, Sign click, authority statement | **Keep** | The legal core (section 5.1) |
| Original and signed copies kept, fingerprints, server-only writes | **Keep** | It's what makes the record reliable, and it's cheap |
| Separate locked storage area for signed records | **Keep** (one small bucket) | Today staff can delete anything in `portal-uploads`. Signed records shouldn't be deletable by mistake |
| Booking-to-booking protection | **Keep** | Same token check the portal already uses |
| Paper option | **Keep**, always available | Required in practice (section 5.1). No per-document switch needed |
| Backups of the files themselves | **Keep**, simplified (section 9) | Nothing backs up files today |
| Staff review separate from signing | **Keep** | It reuses the existing Needs Review → Confirm |
| Six-digit email codes and signing sessions | **Defer** | Not legally required (section 6) |
| Invitation and completion emails | **Remove** | The guest downloads immediately, and the copy stays in Documents |
| Request records with draft / sent / expired / voided states, signer designation, expiry dates | **Remove** | The task's existing status is enough. Staff "Request changes" covers re-signing |
| Certificate page, evidence JSON file, consent-version tables | **Simplify** | The single signature page plus one database row hold the same facts |
| Countersigning | **Defer** until the real contract shows it's needed (Q-1). Meanwhile staff can countersign the signed copy on paper if they must | |
| Template editor, field placement, standard-template versions | **Remove** | The added signature page needs none (section 4) |
| Admin screens (countersigners, consent texts) | **Remove** | Nothing left for them to manage |
| Backup format v3 and restore tools | **Simplify** | Add one table to the existing backup, plus one "download signed documents" button |
| Bundled portal fixes and cleanup (staff-document access, progress weighting, IV wording, permission tidy-ups, pending migrations, public document cleanup) | **Separate**, not part of this project | Listed in section 12 so they aren't forgotten |

---

## 8. Minimum backend work

**1. One SQL migration** (handed to you to review and run):

- **Table `portal_signatures`**, one row per signature:
  - `id`, `booking_id` (deleting the booking is **refused** while signatures exist), `checklist_item_id`, `document_id`, `document_title`;
  - `signer_name`, `signer_title`, `organization`, `for_organization`, `signature_type` (typed or drawn);
  - `agreement_text`, `signed_at`, `ip`, `user_agent`;
  - `original_path`, `original_sha256`, `signed_path`, `signed_sha256`;
  - `request_key` (unique, to stop double submissions).
- **Access:** staff can read. **No one can insert, change or delete through the app.** Only the server function writes.
- **One new column** `portal_checklist_items.sign_document_id`: which document the task is signed with. Empty means today's behavior.
- **Small private bucket `portal-signed`**, PDFs only:
  - staff read;
  - no guest access;
  - **no update or delete rules for anyone.**

  Paths use the record ID, never the portal link.
- `get_portal_record` also returns, per task, whether online signing is on, plus the guest's signed copy, if any, for the Documents tab.

**2. One server function `portal-sign`** (Supabase Edge Function, in this repository, using the free PDF library `pdf-lib`). It has three actions, and each one first finds the booking from the portal token:

- **`open`:**
  - checks that the task belongs to this booking and is set to sign online;
  - returns a 10-minute link to the document and the document's fingerprint.
- **`sign`:**
  - receives the form, the fingerprint the guest was shown, and a `request_key` made when the form opened;
  - checks that the task is still open (Not Started or Waiting on Guest) and that the document hasn't changed since it was opened;
  - builds the signed PDF;
  - saves the original copy and the signed copy;
  - **then**, in one database step, writes the row and moves the task to **Needs Review**;
  - reports success only after that step succeeds.
- **`download`:** gives a 10-minute link to a signed copy that belongs to this booking.

The guest functions for uploading are **not changed**. Their existing rule already stops a paper upload once a task is in review, and `sign` refuses a task that's already in review. Paper and online can't both complete the same task without staff reopening it.

---

## 9. Reliability and backups

- **Double clicks:** the button disables after the first click, and the server also refuses a second row with the same `request_key`. The second click gets back the first result, not a duplicate.
- **Failed saves:** if anything fails before the database step, the guest sees an error and nothing is marked signed. Retrying is safe. A half-saved file without a row is harmless and gets reused on retry.
- **Document replaced while a guest is signing:** the fingerprint check fails, and the guest is asked to review the new version. Nothing is sent again automatically.
- **Earlier signed copies:** kept when a document changes, a task is reopened or a booking is edited. They're never shown as cancelled. A replaced document simply hasn't been signed yet.
- **What we can and can't protect:**
  - Guests and the shared staff login can't change or delete signed records.
  - Whoever holds the Supabase account itself still could, including the fingerprint stored next to a file.
  - The signer's own downloaded copy and the off-site backup are the independent checks.
  - Keep that Supabase account to a named person or two.
- **Backups:**
  - Add `portal_signatures` to the existing manual backup. The app's supported backup versions are a fixed list, so the version number goes up and the app must be updated before such backups are taken.
  - Add a **Download signed documents** button on the Backups page. It saves every file in `portal-signed` plus a list of file names and fingerprints.
  - Staff store that download wherever the other backups go.
  - Restore test, once during development and then at whatever interval Toah Nipi chooses: open the list, re-check the fingerprints, open a few PDFs.
  - Supabase's own database backups never include files.
- **Existing records:** current tasks, uploads and backups are untouched. Online signing only applies to a task once staff choose a document for it.

---

## 10. Implementation sequence

1. **Migration and function**, tested locally with the existing pglite and Deno test setup, using a fictional sample contract, "SAMPLE AGREEMENT – NOT A REAL CONTRACT".
2. **Portal:** Review and sign, the signing form with type or draw, done and download.
3. **Staff app:**
   - "Sign online" choice on the task;
   - "Signed online" details and the signed PDF in the review view;
   - booking delete refusal message.
4. **Backups:** table in the backup, the signed-documents download, one restore test.
5. **Try it** on fictional bookings, then a small pilot with real groups after the lawyer has answered Q-1 to Q-4.

---

## 11. Essential tests

1. **Other bookings:** booking A's link can't open, sign or download anything of booking B's, even with B's IDs.
2. **No faking:** a guest can't write a signature row, change a task to Needs Review or Completed, or put a file in `portal-signed` except through `sign`. `sign` refuses a task that isn't open or isn't set to sign online.
3. **Document changed:** replacing the PDF between opening and signing makes Sign fail with a clear message.
4. **Double click:** two rapid submissions give exactly one row, one signed file and one status change.
5. **Failed save:** forcing a storage or database failure gives no Needs Review and no "Signed" message. A retry then succeeds once.
6. **Records stay put:** staff can't delete or overwrite signed records. Replacing the document, Request changes and re-signing keep the earlier copy. Deleting the booking is refused.
7. **Fingerprints:** each stored file matches its fingerprint, and the original and signed fingerprints differ (the signed copy has the extra page).
8. **Paper still works**, and a paper upload and an online signature can't both complete one task.
9. **Downloads:** links expire after 10 minutes. The copy opens, saves and prints on a phone.
10. **Backup:** the export includes every signed file, all fingerprints match, and the table restores.
11. **Nothing else changes:** existing upload tasks, emails and booking status (including the contract-returned date) behave as before.

---

## 12. Open decisions and questions

**For you:**

- **D-1. Approve this smaller scope**, including no email codes in version 1 (section 6).
- **D-2. Where the "Download signed documents" backup is kept**, and who may hold the Supabase account.

**For the lawyer** (short answers are fine):

- **Q-1.** Does Toah Nipi need to countersign the contract (general and IV)? If yes, is countersigning the downloaded copy acceptable at first?
- **Q-2.** Is an added signature page at the end acceptable for the contract and the policy forms, or must the signature sit on the document's own signature line?
- **Q-3.** Is the agreement wording and authority statement (section 2) acceptable? Is a typed name plus a click enough for the policy forms?
- **Q-4.** For individual and family bookings (personal retreats, family camps, Guest House), does any law require us to give them information in writing? If yes, the fuller federal consumer-consent screen is needed (section 5.2).
- **Q-6.** How long must signed documents be kept, and who may delete them? Until answered, nothing is deleted.

**For the insurer:**

- **Q-5.** Any requirements for electronically signed contracts, such as identity checks or a particular service?

**For office staff:**

- The current **general and IV contract templates.** They aren't in either project, so development uses a fictional sample.
- Confirm which tasks should be signed online (contract, Guest Policy, Guest House, IV Policy).
- Confirm the IV Clean-Up task needs no signature.

**Separate items found during the audit, not part of this project:**

1. Guests probably can't open staff-uploaded documents in the Documents tab today, because no storage rule lets them read those files. Online signing doesn't depend on this, because `portal-sign` serves the document itself.
2. The portal and staff app weigh "Needs Review" differently in progress bars.
3. The public Guest Policy PDF and IV Policy Word file contain the admin Wi-Fi password. Clean them before they're used for signing.
4. The sample insurance certificate shows a real organization's details.
5. Three repository migrations aren't applied to the live database.

---

## 13. Sources

All accessed 2026-11-07.

- **RSA 294-E** (sections 2, 5, 7, 8, 9, 10, 12): <https://gc.nh.gov/rsa/html/XXVII/294-E/294-E-mrg.htm>
- **15 U.S.C. 7001:** <https://www.govinfo.gov/content/pkg/USCODE-2024-title15/html/USCODE-2024-title15-chap96-subchapI-sec7001.htm>
- **15 U.S.C. 7002:** <https://www.govinfo.gov/content/pkg/USCODE-2024-title15/html/USCODE-2024-title15-chap96-subchapI-sec7002.htm>
- **15 U.S.C. 7006:** <https://www.govinfo.gov/content/pkg/USCODE-2024-title15/html/USCODE-2024-title15-chap96-subchapI-sec7006.htm>
- **Supabase backups exclude Storage files:** <https://supabase.com/docs/guides/platform/backups>
- **Live database rules and usage counts:** read with catalog-only queries, saved in [ONLINE_SIGNATURE_LIVE_SCHEMA_2026-11-07.sql](ONLINE_SIGNATURE_LIVE_SCHEMA_2026-11-07.sql).
- **Provider comparison and prices:** in the archived earlier plan, section 3. Not needed unless the insurer or lawyer asks for a provider.
