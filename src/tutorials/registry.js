// Definitions describe learning goals; only the engine's allow-list can operate UI.
const explain = (id, target, text, extra = {}) => ({ id, target, text, kind: 'explain', ...extra });
const state = (id, target, text, expected, extra = {}) => ({ id, target, text, expected, kind: 'state', ...extra });
const navigate = (id, view, title, target) => state(id, `nav-${target}`, `Open ${title} in the navigation. I'll wait until the view is ready.`, { target: 'staff-view', attribute: 'data-tutorial-view', value: view }, { demoAction: target, demoText: `${title} is available from this navigation item. I'll open the view for you.` });

export const tutorials = [
  {
    id: 'prepare-booking', title: 'Prepare a new booking', category: 'Bookings', difficulty: 'Beginner',
    description: 'Learn the form, practise with fictional details, and understand the real save boundary.',
    steps: [
      navigate('open-form', 'Form', 'Form', 'form'),
      explain('group', 'booking-group', 'Start with Guest Group Name, Primary Contact and Retreat Type. Optional secondary contact details live below. We will practise separately so nothing is entered into your real form.'),
      { id: 'practice-group', target: 'practice', kind: 'practice', practice: 'group', text: 'Practice only: enter a fictional group and contact, then choose a retreat type. These details stay in this card and are never saved.', demoText: 'SIMULATION: Pine Trail Group, Alex Example, and a sample retreat type illustrate the required group fields.' },
      explain('guests', 'booking-guests', 'Set arrival and departure dates and an approximate guest count. Departure must not precede arrival. Actual counts, day campers and rates are separate fields.'),
      { id: 'practice-dates', target: 'practice', kind: 'practice', practice: 'dates', text: 'Practice only: choose an arrival date, a departure on or after it, and at least one guest. The guide checks the values before continuing.', demoText: 'SIMULATION: an arrival, a later departure and 24 approximate guests form a valid stay. This is not a real reservation.' },
      explain('services', 'booking-services', 'Continue down the form for meals by day, dietary needs, activities, facilities and assigned staff, lodging, linens and notes. Review the whole request before saving.'),
      explain('save-boundary', 'booking-save', 'Save Guest Group creates a REAL record. We will not press it. For actual work, complete all required fields and save intentionally; only the success notice confirms acceptance. Validation or a server error means the booking was not saved. Practice is complete; your real form has not been filled by this tutorial.'),
    ],
  },
  {
    id: 'view-overview', title: 'View a booking and its Overview', category: 'Bookings', difficulty: 'Beginner',
    description: 'Find an existing group, open its profile, and read the Overview.',
    steps: [
      navigate('open-spreadsheet', 'Spreadsheet View', 'Master Spreadsheet', 'spreadsheet'),
      explain('find', 'spreadsheet-search', 'Use Search Everything to find your group. Year, building and date filters can hide results; adjust them if needed. Read this first, then choose Next to locate a group link.'),
      state('open-record', 'booking-link', 'Open a group-name link. I advance only when a Booking Profile is actually open. If there are no visible groups, use Skip unavailable step or exit and return after loading bookings.', { target: 'staff-view', attribute: 'data-tutorial-view', value: 'Booking Detail' }, { demoTarget: 'practice', demoPractice: 'profile', demoText: 'SIMULATED PROFILE: a group-name link opens the Booking Profile. I use a fictional group here rather than opening a real record.' }),
      state('overview', 'tab-Overview', 'Choose Overview in the profile tabs. If it is already selected, we can continue straight to its summary.', { target: 'booking-profile', attribute: 'data-tutorial-tab', value: 'Overview' }, { demoTarget: 'practice', demoPractice: 'profile', demoText: 'SIMULATED PROFILE: Overview is the starting tab. The other tabs are Edit, Housing, Staff Assignments and Checklists.' }),
      explain('read-overview', 'booking-overview', 'Overview brings together group details, dates, guest counts, lodging, meals and operational information when available. Some cards offer editing: make changes only when intended.', { demoTarget: 'practice', demoPractice: 'profile', demoText: 'SIMULATED PROFILE: review group, stay, guests and services together. The real Overview shows available information for the selected booking.' }),
      explain('other-tabs', 'booking-tabs', 'Edit changes booking information. Housing manages room use and linens; Staff Assignments and Checklists coordinate work. Back returns to the Master Spreadsheet. You have viewed the profile without being asked to change it.', { demoTarget: 'practice', demoPractice: 'profile' }),
    ],
  },
  {
    id: 'calendar', title: 'Navigate the Calendar', category: 'Calendar', difficulty: 'Beginner',
    description: 'Switch views, move through months, and return to the current period.',
    steps: [
      navigate('open-calendar', 'Calendar View', 'Calendar', 'calendar'),
      state('week', 'calendar-week', 'Choose Week for a shorter scheduling view.', { target: 'calendar', attribute: 'data-tutorial-mode', value: 'week' }, { demoAction: 'calendar-week' }),
      state('year', 'calendar-year', 'Choose Year for a broad view. Heatmap and Cards offer different ways to scan the year; month tiles drill into a month.', { target: 'calendar', attribute: 'data-tutorial-mode', value: 'year' }, { demoAction: 'calendar-year' }),
      state('month', 'calendar-month', 'Choose Month to return to the monthly calendar.', { target: 'calendar', attribute: 'data-tutorial-mode', value: 'month' }, { demoAction: 'calendar-month' }),
      state('next-month', 'calendar-next', 'Move to the next month using the right arrow. I wait for the displayed period to change.', { target: 'calendar', attribute: 'data-tutorial-period', changed: true }, { demoAction: 'calendar-next' }),
      state('today', 'calendar-today', 'Choose This Month to return to the current month.', { target: 'calendar', attribute: 'data-tutorial-current', value: 'true' }, { demoAction: 'calendar-today' }),
      explain('exceptions', 'calendar-exceptions', 'Also show controls add exceptional record states. The calendar and dated agenda reflect the current view; seeing a group on the calendar does not itself change the booking.'),
    ],
  },
  {
    id: 'reports', title: 'Access and read Reports', category: 'Reports', difficulty: 'Beginner',
    description: 'Choose a reporting range and understand totals, camper days and export.',
    steps: [
      navigate('open-reports', 'Reports', 'Reports', 'reports'),
      state('custom-range', 'reports-range', 'Choose Custom Date Range in Date Range. I wait until the custom date controls appear. This changes reporting preferences, not booking records.', { target: 'reports', attribute: 'data-tutorial-range', value: 'custom' }, { demoTarget: 'practice', demoPractice: 'report', demoText: 'SIMULATION: choosing Custom Date Range reveals From and To fields. I leave your saved report filters unchanged.' }),
      explain('dates', 'reports-custom', 'Use From and To to set the arrival-date range. Status, Retreat Type and Source narrow the selection further. Reports follow arriving stays, and host records and converted duplicates are excluded according to the inclusion note.', { demoTarget: 'practice', demoPractice: 'report' }),
      explain('totals', 'reports-summary', 'The totals describe the selected report data. A zero result can mean your filters match no groups; it is not a booking save failure.'),
      explain('camper-days', 'reports-camper', 'Camper days measure attendance over time. Read the formula, group breakdown and data-coverage note here before interpreting totals; guests, nights and camper days are different measures.'),
      explain('export', 'reports-export', 'Export CSV downloads the current report selection and is disabled when no records match. I will not start a download. You can revisit Reports and adjust its filters whenever needed.'),
    ],
  },
];

export const safeActions = Object.freeze({
  form: { view: 'Form' }, spreadsheet: { view: 'Spreadsheet View' },
  calendar: { view: 'Calendar View' }, reports: { view: 'Reports' },
  'calendar-week': { target: 'calendar-week' }, 'calendar-year': { target: 'calendar-year' },
  'calendar-month': { target: 'calendar-month' }, 'calendar-next': { target: 'calendar-next' },
  'calendar-today': { target: 'calendar-today' },
});
