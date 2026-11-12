# Open Questions: What We Still Need Answered

*Collected November 12, 2026, from every project document that still has an unanswered question. Each question links back to where it came from, so the full background stays in one place.*

**How to use this.** Take each section to the person named. Write the answer, who gave it and the date under the question. If they don't know yet, write **"Not confirmed yet."** Once an answer is in, the linked document can be updated and the question removed from here.

**Not legal advice.** The questions describe what the software does. Whether a contract or form is enforceable is for Toah Nipi's lawyer to say.

### Contents

1. [For the lawyer](#1-for-the-lawyer) (6 questions)
2. [For the insurance company](#2-for-the-insurance-company) (3 questions)
3. [For the director or leadership](#3-for-the-director-or-leadership) (7 questions)
4. [For office staff](#4-for-office-staff) (5 questions)
5. [For kitchen and other serving staff](#5-for-kitchen-and-other-serving-staff) (staff app discovery)
6. [Technical checks for whoever manages Supabase](#6-technical-checks-for-whoever-manages-supabase)

**What blocks what.** Online signing can't be offered to real guests until the lawyer answers 1.1 to 1.4 and the insurer answers 2.1. The staff app can't start until leadership answers 3.5.

---

## 1. For the lawyer

**Background to share with them:** Guests would be able to sign documents (the rental contract and the policy forms) in the guest portal instead of printing, signing and uploading a scan. The guest types their name or draws a signature, ticks an agreement box and clicks **Sign document**. The system saves the original PDF, a signed copy with a signature page added at the end, and a record of the name entered, the time, the wording agreed to, the IP address and the browser. Paper upload stays available. Full plan and the law we read (New Hampshire RSA 294-E and the federal E-SIGN Act): [ONLINE_SIGNATURE_DECISION_AND_IMPLEMENTATION_PLAN.md](audit/ONLINE_SIGNATURE_DECISION_AND_IMPLEMENTATION_PLAN.md).

### 1.1 Who signs the rental contract, and does Toah Nipi countersign?

- Can a group leader sign our rental contract online?
- Does someone from Toah Nipi also need to sign it? If so, when? Is countersigning the downloaded copy on paper acceptable at first?
- How should we check that the group leader is allowed to make an agreement for their organization? Today the guest only ticks "I am authorized to sign for \<organization\>."
- Do InterVarsity groups and other groups need different arrangements?

*Blocks real use of online signing. Source: plan Q-1; audit L-1.*

**Answer:**\
**Answered by:**\
**Date:**

### 1.2 Is a signature page added at the end acceptable?

The system adds one page after the document's own pages. It names the document and its page count and shows the signature, name, date and time. The blank signature line inside the original stays blank. Is this acceptable for the contract and the policy forms, or must the signature sit on the document's own signature line?

*Blocks real use. Source: plan Q-2.*

**Answer:**\
**Answered by:**\
**Date:**

### 1.3 Is our agreement wording acceptable, and what do the policy form signatures mean?

The draft wording guests would tick:

> "I agree to sign this document electronically, and that my typed or drawn signature has the same effect as a handwritten one."
>
> When signing for a group: "I am authorized to sign for \<organization\>."

- Is this wording acceptable? If not, what should it say?
- Is a typed name plus a click enough for the policy forms (Guest Policy, Guest House, InterVarsity Policy)?
- When guests sign a policy form, are they only confirming they read the rules, or agreeing to follow them?
- Should the Guest House rules and fees be part of the rental agreement instead?
- Version 1 does not check identity. The portal link is shared within a group, so the record shows that *someone with the group's link* typed a name, not that the named person did. The recorded IP address can also be inaccurate. Is that acceptable for these documents, or do we need an email code sent to the signer?

*Blocks real use. The wording is marked "draft, not approved" in the system until this is answered. Source: plan Q-3, section 6; audit L-2; security report SEC-18.*

**Answer:**\
**Answered by:**\
**Date:**

### 1.4 Do individual and family bookings need extra consent steps?

Church, school, ministry and InterVarsity groups are organizations. Personal retreats, family camps, Guest House stays and family reunions may count as consumer transactions under federal law. If any law requires us to give these guests information **in writing**, they need a longer consent screen before signing (paper option, how to withdraw, how to get copies, what software is needed).

- Does any law require written information for these kinds of bookings?
- If yes, what should the screen say, and how should someone ask for paper or stop using electronic documents?

*Blocks real use for individual and family bookings. If the answer is yes, those bookings stay on paper until the longer screen is built. Source: plan Q-4, section 5.2; audit L-4.*

**Answer:**\
**Answered by:**\
**Date:**

### 1.5 How long must we keep signed documents, and who may delete them?

- How long should we keep each kind of signed document, and the record of who signed what and when?
- Are there situations where we must keep them longer, such as an injury claim or a dispute?
- Who may delete records once that time has passed?

Until this is answered, nothing is deleted. Signed records are locked so nobody can delete them through the apps.

*Doesn't block a pilot. Source: plan Q-6; audit L-5. The insurer may also have a view (2.3).*

**Answer:**\
**Answered by:**\
**Date:**

### 1.6 Liability releases (later phase)

Individual liability releases, which "all guests must sign," are **not** part of version 1. Before they are ever added:

- Does our current release give the protection we expect?
- Can adults sign it online?
- What can a parent or guardian legally agree to for a child?

*Doesn't block anything now. Source: audit L-3, E-6.*

**Answer:**\
**Answered by:**\
**Date:**

---

## 2. For the insurance company

### 2.1 Do you have rules about online signing?

- Will contracts signed online in our own guest portal meet our policy's requirements?
- Do you require a particular signing service, identity check or kind of signing record?
- Are the requirements different for rental contracts, policy forms and liability releases?

*Blocks real use of online signing. If the insurer requires a signing service or identity checks, the plan changes. Source: plan Q-5; audit L-6.*

**Answer:**\
**Answered by:**\
**Date:**

### 2.2 Liability releases (later phase)

Do you have requirements for liability release forms, or for how they are signed, including for minors?

*Source: audit L-3.*

**Answer:**\
**Answered by:**\
**Date:**

### 2.3 How long should signed records be kept?

Do you require us to keep signed contracts and forms for a minimum period?

*Source: audit L-5. See 1.5.*

**Answer:**\
**Answered by:**\
**Date:**

---

## 3. For the director or leadership

### 3.1 Approve the smaller online signing plan

Version 1 has no email codes, no outside signing company and no new fees. Paper upload stays available. Approve this scope?

*Source: plan D-1.*

**Answer:**\
**Answered by:**\
**Date:**

### 3.2 Who holds the Supabase account, and where do signed-document backups go?

- Whoever holds the Supabase account can change or delete anything, including signed records. Who should that be? The plan recommends one or two named people.
- Where should the **Download signed documents** backup files be stored?

*Source: plan D-2.*

**Answer:**\
**Answered by:**\
**Date:**

### 3.3 Clean up the documents guests can download

- The public Guest Policy PDF and the InterVarsity Policy Word file contain the admin Wi-Fi password. Is that intended for guests? If not, remove it from both files and decide whether to change the password.
- The sample insurance certificate shows a real organization's details. Replace it with a fictional example, or remove it?
- Which documents can stay public, and which should only be given to booked groups?

*Must be done before these files are used for online signing. Source: audit L-7; plan section 12.*

**Answer:**\
**Answered by:**\
**Date:**

### 3.4 Staff sign-in and repository settings

These are decisions from the security review. Details are in the private security report (`docs/audit/SECURITY_AUDIT_2026-11-10.md`, kept out of the public repository), section 8.

- Should every staff member have their own login, with administrator access limited to one or two people? (SEC-02, the most important.)
- Should the three GitHub repositories be made private? It costs nothing. (SEC-16)

**Answer:**\
**Answered by:**\
**Date:**

### 3.5 The staff app proposal

From [TOAH_NIPI_STAFF_APP_PROPOSAL.md](proposals/TOAH_NIPI_STAFF_APP_PROPOSAL.md), "Decisions for this meeting":

1. Proceed with discovery and a small pilot?
2. Pilot roles: the kitchen plus which other team?
3. First release: home, calendar, group details and kitchen (By Day and By Booking)?
4. Who keeps meal times, confirmed counts and dietary details current, and how quickly after a change?
5. Who tests it, and on which weekends?

Also:

- Should anyone outside the office be able to change a meal time or a guest count directly?
- Should internal use, such as a staff lunch, appear in kitchen counts and housekeeping?

**Answer:**\
**Answered by:**\
**Date:**

### 3.6 Email staff when guests submit portal items?

From [STAFF_EMAIL_NOTIFICATIONS_PROPOSAL.md](STAFF_EMAIL_NOTIFICATIONS_PROPOSAL.md). The recommendation is one daily summary at 8:00 AM to one shared staff inbox, with no guest details in the email.

1. Is this wanted, and for uploads only or all submissions?
2. Immediate emails, a daily summary, or both?
3. Who receives them: a shared inbox, named people, or each booking's assigned staff?
4. What time for the summary?
5. Quiet on weekends or holidays?
6. What may appear in the email? (Recommended: group name, item title and a link only.)
7. Who may change these settings?

**Answer:**\
**Answered by:**\
**Date:**

### 3.7 Approve going live with online signing

After 1.1–1.4, 2.1 and 3.3 are answered and a trial on a fictional booking passes, who gives the final go-ahead to turn it on for real guests?

*Source: [portal-signing/SETUP.md](portal-signing/SETUP.md), "Before real guests use it."*

**Answer:**\
**Answered by:**\
**Date:**

---

## 4. For office staff

### 4.1 The real contract templates

Please share the current **general** and **InterVarsity** rental contract templates. They aren't in either project, so online signing has only been tested with a fictional sample. The lawyer will also need them for 1.1–1.3.

*Source: plan section 12.*

**Answer:**\
**Answered by:**\
**Date:**

### 4.2 Which tasks should be signed online?

- Confirm which portal tasks should offer online signing: the contract, Guest Policy, Guest House, InterVarsity Policy?
- Confirm that the InterVarsity Clean-Up task needs no signature.

*Source: plan section 12.*

**Answer:**\
**Answered by:**\
**Date:**

### 4.3 Who will be trained on online signing?

Staff need to know how to link a task to a document, review a signed copy, send it back for changes and make the signed-documents backup. Who should be shown?

*Source: SETUP.md checklist.*

**Answer:**\
**Answered by:**\
**Date:**

### 4.4 Does the spreadsheet's Camper Days figure include day campers?

The Reports page doesn't add day campers to stored Camper Days. If the Master spreadsheet's own figure already includes them, adding them would count them twice.

*Source: [REPORTS_PAGE_IMPROVEMENT_PROPOSAL.md](proposals/REPORTS_PAGE_IMPROVEMENT_PROPOSAL.md), decision 5 and D-04.*

**Answer:**\
**Answered by:**\
**Date:**

### 4.5 Reports assumptions to confirm

- Is Friday and Saturday the right definition of a weekend stay?
- Can Hebron's two parts be added together when counting open weekends?
- Which years of Master spreadsheets are loaded?

*Source: Reports proposal, "Assumptions to confirm."*

**Answer:**\
**Answered by:**\
**Date:**

---

## 5. For kitchen and other serving staff

These are discovery questions for the staff app, best asked in short conversations. Source: [TOAH_NIPI_STAFF_APP_PROPOSAL.md](proposals/TOAH_NIPI_STAFF_APP_PROPOSAL.md).

- What do you need to know the day before a group arrives, and where do you get it now?
- When was the last time a change reached you late? What was it?
- Which numbers do you need to be exact, and which can be estimates?
- Do you have your own phone at work? Is there signal where you work, and are any phones shared?
- What would you *not* want on your screen?
- **Cook:** should the kitchen view open on **By Day** or **By Booking**, and is By Booking more useful on a phone or at a desk?
- **Housekeeping:** what do you actually need for turnovers (room split, linens, times)?

**Answers:**\
**Answered by:**\
**Date:**

---

## 6. Technical checks for whoever manages Supabase

These aren't questions for a person to decide. They need someone with access to the live database or hosting to look something up. They are listed so they aren't forgotten.

| Check | Why | Where the details are |
|---|---|---|
| Run the read-only Appendix A queries and share the results | Decides whether archived visits are counted as stays (Reports decision 3) and how much history comparison can use | [Reports proposal](proposals/REPORTS_PAGE_IMPROVEMENT_PROPOSAL.md), decisions 3 and 9, Appendix A |
| Confirm the live staff app and guest portal run the latest build | The signing database and server function are deployed, but the two websites weren't verified | [portal-signing/SETUP.md](portal-signing/SETUP.md), Deploy step 3 |
| Remaining security deploy steps and the gaps that couldn't be checked | Several fixes are written but not yet live | Private security report, sections 8 and 9 |
| Earlier audit checks V-001 to V-022 | Some may have been settled by later work, so check before running | [AUDIT_QUESTIONS_ANSWERED.md](audit/AUDIT_QUESTIONS_ANSWERED.md), Part C |

---

## Where these came from

| Document | What it contributed |
|---|---|
| [ONLINE_SIGNATURE_DECISION_AND_IMPLEMENTATION_PLAN.md](audit/ONLINE_SIGNATURE_DECISION_AND_IMPLEMENTATION_PLAN.md) | Q-1 to Q-6, D-1, D-2, office items |
| [ONLINE_SIGNATURE_AUDIT_AND_QUESTIONS.md](audit/ONLINE_SIGNATURE_AUDIT_AND_QUESTIONS.md) | L-1 to L-7 (overlap with the plan merged here) |
| [portal-signing/SETUP.md](portal-signing/SETUP.md) | Go-live checklist |
| Security report (private, not in the repository) | SEC-02, SEC-16, SEC-18 |
| [TOAH_NIPI_STAFF_APP_PROPOSAL.md](proposals/TOAH_NIPI_STAFF_APP_PROPOSAL.md) | Leadership decisions and staff questions |
| [STAFF_EMAIL_NOTIFICATIONS_PROPOSAL.md](STAFF_EMAIL_NOTIFICATIONS_PROPOSAL.md) | Seven decisions |
| [REPORTS_PAGE_IMPROVEMENT_PROPOSAL.md](proposals/REPORTS_PAGE_IMPROVEMENT_PROPOSAL.md) | Camper Days, assumptions, read-only queries |
| [AUDIT_QUESTIONS_ANSWERED.md](audit/AUDIT_QUESTIONS_ANSWERED.md) | All business questions are answered. Only the Part C technical checks remain |
