# PROPOSAL: Email staff when guests submit portal information

**Status: proposal for discussion only. Nothing described here is built or enabled. No staff notification emails are sent.**

## The idea

Today staff find out about guest activity by opening Portal Admin. Guests upload documents (insurance, waivers, rosters) and submit information (guest counts, allergies), and the item then shows **Needs Review**.

An optional notification could tell staff when that happens, so submissions get reviewed sooner, especially close to a retreat.

## Two ways to do it

| | Immediate notice | Daily summary |
|---|---|---|
| What | One email shortly after a guest submits (grouped over ~10 minutes) | One email each morning listing every group with items waiting for review |
| Good for | Time-sensitive items close to arrival | A predictable routine; low inbox noise |
| Downside | Can be noisy during busy weeks; easy to start ignoring | Up to a day's delay |
| Rough volume | One per submission burst per group | At most one per day, none when nothing is waiting |

A middle option: daily summary by default, with an immediate notice only for retreats starting within the next 7 days.

## Benefits

- Faster review, so guests learn sooner if something needs changing.
- Fewer items sitting in Needs Review.
- Less need to check Portal Admin repeatedly.

## Trade-offs to weigh

- **Inbox noise.** Too many emails train people to ignore them. The daily summary limits this.
- **Privacy.** Emails should name the group and the item ("Oak Hill Youth submitted Certificate of insurance"), link to Portal Admin, and never include uploaded files, allergy details or other guest answers. Staff open the app to see the content.
- **Shared login.** Staff currently share one sign-in, so emails can't follow individual accounts. Recipients would be a short, explicit list.
- **Reuse.** It would reuse the guest email system's sender, safety modes, outbox and history, with a separate on/off switch that starts off.

## Decisions needed

1. Is this wanted at all, and for which events: uploads only, or all submissions?
2. Immediate, daily summary, or the hybrid?
3. Who receives it: one shared staff inbox (for example contactus@toahnipi.org), named people, or each booking's assigned staff from the staff directory?
4. Which time of day for a summary (New York time)?
5. Should it go quiet on weekends or holidays?
6. Which details may appear in the email? Recommended: the group name, the item title and a link only.
7. Who may change these settings?

## Recommendation for a first version (if approved)

A daily summary at 8:00 New York time to one shared staff inbox, listing groups with items in Needs Review, with a link to Portal Admin and no guest content. It would be off by default and use the same dry-run → test → live rollout as guest emails.
