<!-- questionnaire v1 -->
<!-- answers format="1" questionnaire="gj6TGqxErYRzRXTs_clNWQ" source="questions.md" source-sha256="aa173691fc21f5c8983ed5b69844b7124c12cfb045f91c16973f60ba066c53fe" revision="16" submission="yz9COUGUAyhR1ne5M0Ad4Q" submitted="2026-11-19T19:58:40Z" -->
> **Answered questionnaire** (Claude Status, questionnaire format v1).
> 9 questions: 8 answered, 1 Let the AI decide, 0 skipped, 0 unanswered.
> Each question is followed by its answer block. "Let the AI decide" = decide yourself and record the decision when implementing. "Skipped" and "Unanswered" = no answer, not approval. Read comments together with the selected options.
<!-- /answers -->
# Group Map: a few decisions before I build

<!-- project: Toah Nipi Booking Software -->

I'm going to build the Group Map: a picture of organizations and their subgroups, like a family tree.

Right now the software has no list of groups at all. Each booking just has the group's name typed in. So I need to add a proper list of groups, and decide how bookings connect to it. Nothing about your existing bookings will be deleted or renamed.

<!-- question id="booking-link" type="single" required="true" -->
## How should a booking be connected to a group?

<!-- context -->
**By name.** For each group, staff pick which group names belong to it. For example, "IV Rutgers" and "InterVarsity Rutgers" can both belong to the Rutgers chapter. Every booking with one of those names, past or future, then shows up under that group. Bookings themselves are not changed at all.

The catch: if two different groups have the exact same name (for example two churches both called "First Baptist"), they can't be told apart.

**Booking by booking.** Each booking gets its own "belongs to group" setting. This is more precise, but staff have to connect every booking one at a time, including new ones, and it changes more of the existing software (booking forms, imports, backups).

**Both.** Name matching by default, with the option to override a single booking. This is the most work to build.

<!-- options -->
- `by-name` By name (staff choose which names belong to each group)
- `per-booking` Booking by booking
- `both` Both

<!-- recommended: by-name -->
It's the quickest for staff and the safest for your existing records. A booking-by-booking override can be added later if identical names become a problem.

<!-- answer id="booking-link" status="answered" recommendation="no" -->
**Answer to `booking-link`: Answered**

Selected:
- `by-name` By name (staff choose which names belong to each group)
<!-- /answer -->

<!-- question id="initial-groups" type="single" required="true" -->
## How should the group list get started?

<!-- context -->
- **Start empty:** the map shows a list of every group name that isn't connected yet. Staff turn names into groups or add them to existing groups as they go.
- **Start empty, plus a shortcut button:** same as above, plus a button staff can press to create one group per unconnected name all at once. It never combines similar names and never decides who belongs under whom. Typos will become their own groups until someone tidies up.
- **Create them automatically when installed:** same result as the button, but it happens without anyone pressing anything.

<!-- options -->
- `empty` Start empty
- `import-button` Start empty, plus a shortcut button
- `migration-seed` Create them automatically when installed

<!-- recommended: empty -->
Nothing changes until a person decides it should. The shortcut button is worth it if you have hundreds of group names.

<!-- answer id="initial-groups" status="answered" recommendation="used" -->
**Answer to `initial-groups`: Answered** (used the recommendation)

Selected:
- `empty` Start empty
<!-- /answer -->

<!-- question id="sources" type="multiple" required="true" -->
## What should a group's details show?

When you click a group, the details panel lists what belongs to it. It always keeps that group's own records separate from the totals that include its subgroups.

<!-- options -->
- `bookings` Bookings
- `hosting` Hosting records
- `inquiries` Guest inquiries (not booked yet)
- `contacts` Contacts (the people on those bookings)

<!-- recommended: bookings, contacts -->
Bookings and their contacts are what staff will look for. Inquiries and hosting are kept separate elsewhere in the software, so I'd leave them out at first unless you want them.

<!-- answer id="sources" status="answered" recommendation="used" -->
**Answer to `sources`: Answered** (used the recommendation)

Selected:
- `bookings` Bookings
- `contacts` Contacts (the people on those bookings)
<!-- /answer -->

<!-- question id="placement" type="single" required="true" -->
## Where should the Group Map go?

<!-- options -->
- `contacts-toggle` Inside Contacts, with a "Contacts | Group Map" switch at the top
- `sidebar-item` Its own item in the sidebar, right under Contacts

<!-- recommended: contacts-toggle -->
It keeps groups next to their people and works like the switches you already have, such as Compact | Large on the booking page. Its own sidebar item would give it a bit more room on phones.

<!-- answer id="placement" status="answered" recommendation="used" -->
**Answer to `placement`: Answered** (used the recommendation)

Selected:
- `contacts-toggle` Inside Contacts, with a "Contacts | Group Map" switch at the top
<!-- /answer -->

<!-- question id="editors" type="single" required="true" -->
## Who should be allowed to change groups?

Changing groups means creating, renaming, or moving them under a different parent. Everyone who can see Contacts can look at the map.

<!-- options -->
- `manage-bookings` Admins and staff (the same people who can edit bookings)
- `admin-only` Admins only

<!-- recommended: manage-bookings -->
It matches who can already edit bookings. Viewer accounts and staff app accounts stay view-only or have no access.

<!-- answer id="editors" status="answered" recommendation="used" -->
**Answer to `editors`: Answered** (used the recommendation)

Selected:
- `manage-bookings` Admins and staff (the same people who can edit bookings)
<!-- /answer -->

<!-- question id="delete" type="single" required="true" -->
## What should happen when someone deletes a group?

Deleting a group never deletes bookings, contacts, or documents.

<!-- options -->
- `block-until-empty` Only allowed once the group has no subgroups and no names connected to it
- `lift-children` Allowed anytime; its subgroups move up one level, after a confirmation that lists what will change
- `no-delete` No deleting for now; groups can only be renamed or disconnected

<!-- recommended: block-until-empty -->
It's the safest choice: nothing moves without someone choosing it. Staff move the subgroups somewhere else first, then delete.

<!-- answer id="delete" status="answered" recommendation="used" -->
**Answer to `delete`: Answered** (used the recommendation)

Selected:
- `block-until-empty` Only allowed once the group has no subgroups and no names connected to it
<!-- /answer -->

<!-- question id="library" type="single" required="true" -->
## Should I use an add-on to draw the map, or build it myself?

Either way it's free, and you can drag, zoom, and fit the map to the screen.

<!-- context -->
- **Build it myself:** the app stays smaller and the map is easy to match to your Light and Night themes. It's more custom code for me to write and maintain.
- **Use an add-on (React Flow, free):** zooming and dragging come ready-made and well tested. It makes the app a little larger to download (only when someone opens the map), and it takes extra work to match your styling.

<!-- options -->
- `no-dependency` Build it myself
- `react-flow` Use the add-on (React Flow)

<!-- recommended: no-dependency -->
A simple top-down tree of a few hundred groups doesn't need an add-on, and the map will look like the rest of the software.

<!-- answer id="library" status="answered" recommendation="used" -->
**Answer to `library`: Answered** (used the recommendation)

Selected:
- `no-dependency` Build it myself
<!-- /answer -->

<!-- question id="scale" type="short" required="false" -->
## Roughly how many different group names are there, and how many levels deep could a group go?

For example, "about 400 names, at most 4 levels." I can't see your real data, so a rough guess helps me plan.

<!-- answer id="scale" status="answered" recommendation="no" -->
**Answer to `scale`: Answered**

```text
Maybe like 600? I dont know, at most probably 3 levels
```
<!-- /answer -->

<!-- question id="anything-else" type="long" required="false" -->
## Anything else the map should show or avoid?

For example, an example group structure you'd use to check it, made-up names are fine, or anything you'd expect to see when clicking a group.

<!-- answer id="anything-else" status="delegated" recommendation="no" -->
**Answer to `anything-else`: Let the AI decide**

The AI decides: use your judgment, and record the decision and why when implementing.
<!-- /answer -->

