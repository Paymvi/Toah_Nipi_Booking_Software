/*
  Master workbook import (Master 2025, 2026 and 2027 spreadsheets): reads
  sheet rows into bookings and plans how a re-import updates saved records.
  Moved unchanged from src/pages/Dashboard.jsx so it can be tested; the
  file picker, ExcelJS loading and messages stay in the Dashboard.
*/

import { getRowsFromWorksheetFlexible } from "./spreadsheetUtils.js";
import { mergeMasterImportRecord, withImportBaseline } from "./masterImportMerge.js";

/* =========================================================
   MASTER WORKBOOK IMPORT
   Match headers by name; preserve source cells and avoid inventing
   dates, age groups, housing allocations, or payment information.
========================================================= */

function normalizeMasterImportHeader(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/\*\*/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function masterImportCellValue(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;
  if ("result" in value) return masterImportCellValue(value.result);
  if (Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text || "").join("");
  }
  if ("text" in value) return value.text;
  if ("hyperlink" in value) return value.hyperlink;
  return "";
}

export function masterImportText(value) {
  const cell = masterImportCellValue(value);
  return cell instanceof Date && !Number.isNaN(cell.getTime())
    ? cell.toISOString()
    : String(cell ?? "").replace(/\u00a0/g, " ").trim();
}

function readMasterImportCell(row, aliases) {
  for (const alias of aliases) {
    const key = Object.keys(row || {}).find(
      (header) => normalizeMasterImportHeader(header) === normalizeMasterImportHeader(alias)
    );
    if (key !== undefined) {
      const value = masterImportCellValue(row[key]);
      if (masterImportText(value) !== "") return value;
    }
  }
  return "";
}

export function hasMasterImportHeader(row, aliases) {
  const headers = new Set(Object.keys(row || {}).map(normalizeMasterImportHeader));
  return aliases.some((alias) => headers.has(normalizeMasterImportHeader(alias)));
}

function masterImportNumber(value) {
  const text = masterImportText(value).replace(/[$,]/g, "");
  return /^\d+(?:\.\d+)?$/.test(text) ? text : "";
}

export function masterImportUnknown(value) {
  return /^(?:n\/?a|none|unknown|tbd|\?|[-–—])$/i.test(masterImportText(value));
}

function masterImportYes(value) {
  return /^(?:yes|y|true|received|rec['’]?d|returned|signed|complete|completed)(?:\b|;)/i
    .test(masterImportText(value));
}

export function parseMasterImportTime(value, warnings = [], label = "Time") {
  const text = masterImportText(value);
  if (!text) return "";
  const match = text.match(/(?:^|\s|@)(\d{1,2}):(\d{2})(?::\d{2})*(?:\.\d+)?(?:\s*(a\.?m\.?|p\.?m\.?))?\s*$/i);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = (match[3] || "").replace(/\./g, "").toLowerCase();
  if (minute > 59 || hour > 23 || (meridiem && (hour < 1 || hour > 12))) {
    warnings.push(`${label} needs review: ${text}`);
    return "";
  }
  if (meridiem) hour = (hour % 12) + (meridiem === "pm" ? 12 : 0);
  // The samples mix 24-hour times and values such as "2:00" without AM/PM.
  if (!meridiem && hour >= 1 && hour <= 7 && match[1].length === 1) {
    warnings.push(`${label} '${match[0].trim()}' has no AM/PM; the original value is preserved.`);
    return "";
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseMasterImportDate(value, year, warnings = [], label = "Date") {
  const cell = masterImportCellValue(value);
  if (masterImportText(cell) === "" || masterImportUnknown(cell)) return { date: "", time: "" };
  let excelDate = null;
  if (cell instanceof Date) excelDate = cell;
  if (typeof cell === "number" && cell > 20000 && cell < 100000) {
    excelDate = new Date(Date.UTC(1899, 11, 30) + Math.round(cell * 86400000));
  }
  if (excelDate && !Number.isNaN(excelDate.getTime())) {
    const date = excelDate.toISOString().slice(0, 10);
    const hours = excelDate.getUTCHours();
    const minutes = excelDate.getUTCMinutes();
    return {
      date,
      time: hours || minutes
        ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
        : "",
    };
  }
  const text = masterImportText(cell);
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]|$)/);
  const us = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?:\s|$)/);
  if (!iso && !us) {
    warnings.push(`${label} could not be read: ${text}`);
    return { date: "", time: "" };
  }
  let parsedYear = iso ? Number(iso[1]) : Number(us[3] || year);
  if (parsedYear < 100) parsedYear += parsedYear >= 70 ? 1900 : 2000;
  const month = Number(iso ? iso[2] : us[1]);
  const day = Number(iso ? iso[3] : us[2]);
  const dateObject = new Date(Date.UTC(parsedYear, month - 1, day));
  if (dateObject.getUTCFullYear() !== parsedYear || dateObject.getUTCMonth() !== month - 1 || dateObject.getUTCDate() !== day) {
    warnings.push(`${label} is not a valid calendar date: ${text}`);
    return { date: "", time: "" };
  }
  const remainder = text.slice((iso || us)[0].length).replace(/Z$/, "").trim();
  return {
    date: dateObject.toISOString().slice(0, 10),
    time: remainder ? parseMasterImportTime(remainder, warnings, `${label} time`) : "",
  };
}

function masterImportDocumentDate(value, year) {
  const cell = masterImportCellValue(value);
  if (cell instanceof Date || typeof cell === "number") return parseMasterImportDate(cell, year).date;
  const text = masterImportText(cell);
  if (/^(?:no|not|n\/?a)\b/i.test(text)) return "";
  const match = text.match(/\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  return match ? parseMasterImportDate(match[0], year).date : "";
}

function getMasterImportStayDates(startDate, endDate) {
  if (!startDate || !endDate || endDate < startDate) return [];
  const dates = [];
  const end = Date.parse(`${endDate}T00:00:00Z`);
  for (let time = Date.parse(`${startDate}T00:00:00Z`); time <= end && dates.length < 180; time += 86400000) {
    dates.push(new Date(time).toISOString().slice(0, 10));
  }
  return dates;
}

export function parseMasterImportMeals(text, startDate, endDate, explicitCount, warnings) {
  const raw = masterImportText(text);
  let count = masterImportNumber(explicitCount);
  const numbered = raw.match(/(?:^|[.\s])(\d+)\s*(?:meals?\s*)?-\s*/i);
  if (count !== "" && numbered && Number(count) !== Number(numbered[1])) {
    warnings.push(`The meal description lists ${numbered[1]} meal(s), while #Meals lists ${count}; the #Meals count is retained.`);
  }
  if (count === "" && numbered) count = numbered[1];
  if (/^(?:no meals?|none|n\/?a|0)$/i.test(raw)) {
    if (count !== "" && count !== "0") warnings.push("The meal count conflicts with the no-meals description; check the original spreadsheet values.");
    if (count === "") count = "0";
    return { count, mealSchedule: {}, firstMeal: "", lastMeal: "", summary: raw };
  }
  const result = { count, mealSchedule: {}, firstMeal: "", lastMeal: "", summary: raw };
  if (!raw || count === "0" || masterImportUnknown(raw)) return result;
  const dates = getMasterImportStayDates(startDate, endDate);
  if (!dates.length) return result;
  const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const meals = ["breakfast", "lunch", "dinner"];
  const dayPattern = "(?:sun(?:day)?|mon(?:day)?|tue(?:sday|s)?|wed(?:nesday)?|thu(?:rsday|rs|r)?|fri(?:day)?|sat(?:urday)?)";
  const mealPattern = "(?:breakfast|lunch|dinner)";
  let plan = numbered ? raw.slice(numbered.index + numbered[0].length) : raw;
  // Snacks are notes, not an additional breakfast/lunch/dinner selection.
  plan = plan.replace(/snack[^.]*\.(?:\s*)/gi, "").split(/\(\s*no\b|;|\.\s+(?:Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday)\s+(?:breakfast|lunch|dinner)\s*@/i)[0];
  const pairPattern = new RegExp(`\\b(${dayPattern})\\.?\\s*(${mealPattern})\\b|\\b(${mealPattern})\\s+(${dayPattern})\\b`, "gi");
  const pairs = Array.from(plan.matchAll(pairPattern)).map((match) => ({
    day: (match[1] || match[4]).slice(0, 3).toLowerCase(),
    meal: (match[2] || match[3]).toLowerCase(),
    offset: match.index,
  }));
  const range = /\b(?:through|thru|to)\b/i.test(plan);
  const selections = [];
  const findDate = (day, after = "") => dates.find((date) => date >= after && weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()] === day);
  if (range && pairs.length >= 1) {
    const first = pairs[0];
    let last = pairs[pairs.length - 1];
    if (pairs.length === 1) {
      const ending = plan.split(/\b(?:through|thru|to)\b/i)[1]?.match(/\b(breakfast|lunch|dinner)\b/i);
      if (ending) last = { ...first, meal: ending[1].toLowerCase() };
    }
    const from = findDate(first.day);
    const to = findDate(last.day, from);
    if (from && to) {
      const slots = dates.flatMap((date) => meals.map((meal) => ({ date, meal })));
      const firstSlot = slots.findIndex((slot) => slot.date === from && slot.meal === first.meal);
      const lastSlot = slots.findIndex((slot) => slot.date === to && slot.meal === last.meal);
      if (lastSlot >= firstSlot) selections.push(...slots.slice(firstSlot, lastSlot + 1));
    }
  } else {
    const mentionedDays = [...new Set((plan.match(new RegExp(`\\b${dayPattern}\\b`, "gi")) || []).map((day) => day.slice(0, 3).toLowerCase()))];
    if (mentionedDays.length === 1) {
      const date = findDate(mentionedDays[0]);
      const selectedMeals = [...new Set((plan.match(/\b(?:breakfast|lunch|dinner)\b/gi) || []).map((meal) => meal.toLowerCase()))];
      if (date) selectedMeals.forEach((meal) => selections.push({ date, meal }));
    } else {
      pairs.forEach((pair) => {
        const date = findDate(pair.day);
        if (date) selections.push({ date, meal: pair.meal });
      });
    }
  }
  const unique = [...new Map(selections.map((slot) => [`${slot.date}:${slot.meal}`, slot])).values()]
    .sort((a, b) => a.date.localeCompare(b.date) || meals.indexOf(a.meal) - meals.indexOf(b.meal));
  if (!unique.length || (count !== "" && Number(count) !== unique.length)) {
    warnings.push("Meal dates/count do not form a clear schedule; the original meal instructions are preserved for review.");
    return result;
  }
  unique.forEach(({ date, meal }) => {
    result.mealSchedule[date] ||= { breakfast: false, lunch: false, dinner: false };
    result.mealSchedule[date][meal] = true;
  });
  result.count = count || String(unique.length);
  const label = (meal) => meal[0].toUpperCase() + meal.slice(1);
  result.firstMeal = label(unique[0].meal);
  result.lastMeal = label(unique[unique.length - 1].meal);
  const totals = meals.map((meal) => `${label(meal)}: ${unique.filter((slot) => slot.meal === meal).length}`).join(", ");
  result.summary = [
    `Total meals: ${result.count} (${totals})`,
    ...Object.entries(result.mealSchedule).map(([date, selected]) =>
      `${new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}: ${meals.filter((meal) => selected[meal]).map(label).join(", ")}`
    ),
  ].join("; ");
  return result;
}

export function parseMasterImportLinens(value) {
  const text = masterImportText(value);
  if (!text || /^(?:n\/?a|\?)$/i.test(text)) return {};
  if (/^(?:no|none|0|not needed)$/i.test(text)) return { linenOption: "No", linenSets: "0", linenPieces: "0" };
  if (/^(?:yes|all|included)$/i.test(text)) return { linenOption: "All" };
  const pieces = text.match(/^(\d+)\s+(?:towels?|pillowcases?|sheets?|pieces?)\b/i);
  if (pieces) return { linenOption: "Some", linenPieces: pieces[1] };
  const sets = text.match(/^(\d+)(?:\s*$|\s*(?:-|sets?\b|linen\b))/i);
  return { linenOption: "Some", ...(sets ? { linenSets: sets[1] } : {}) };
}

/*
  Status the sheet row itself states, or "" when the row says nothing about
  status. Re-imports only change a saved status when this is non-empty.
*/
export function getExplicitMasterImportStatus({ confirmed, stage, cancellationDate, cancellationReason, contractReturned, contractSent, year }) {
  if (cancellationDate || cancellationReason || /cancel/i.test(`${confirmed} ${stage}`)) return "Cancelled";
  if (/unconfirmed|considering|tentative/i.test(confirmed)) return "Inquiry";
  if (/\bconfirmed\b|\bbooked\b/i.test(confirmed)) return "Confirmed";
  if (/waitlist/i.test(`${confirmed} ${stage}`)) return "Waitlist";
  if (masterImportYes(contractReturned) || masterImportDocumentDate(contractReturned, year)) return "Confirmed";
  if (masterImportYes(contractSent) || masterImportDocumentDate(contractSent, year)) return "Contract Sent";
  if (/unconfirmed|considering|inquiry|lead|tentative/i.test(stage)) return "Inquiry";
  if (/contract.*(?:signed|returned|received|rec['’]?d)/i.test(stage)) return "Confirmed";
  if (/feedback|invoice|payment due|paid|confirmed|booked/i.test(stage)) return "Confirmed";
  if (/contract/i.test(stage)) return "Contract Sent";
  return "";
}

// New records with no stated status keep the year default (AUDIT-024 deferred).
export function getMasterImportStatus(values) {
  return getExplicitMasterImportStatus(values) || (values.year === 2027 ? "Inquiry" : "Confirmed");
}

export function getMasterImportIdentity(booking, includeContact = true) {
  const type = masterImportText(booking.detectedImportType || booking.sourceType);
  if (!/^Master 20\d{2}$/i.test(type)) return "";
  const values = [type, booking.organizationName, booking.startDate, booking.endDate];
  if (includeContact) values.push(booking.contactName === "No contact name" ? "" : booking.contactName);
  return values.map((value) => masterImportText(value).toLowerCase().replace(/\s+/g, " ")).join("|");
}

export function createMasterImportId(booking) {
  const identity = getMasterImportIdentity(booking);
  let first = 2166136261;
  let second = 5381;
  for (const character of identity) {
    first = Math.imul(first ^ character.charCodeAt(0), 16777619);
    second = Math.imul(second, 33) ^ character.charCodeAt(0);
  }
  const year = masterImportText(booking.sourceType).match(/20\d{2}/)?.[0] || "record";
  return `master-v2-${year}-${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}`;
}

export function normalizeMasterImportRow(row, index, year) {
  const get = (...aliases) => readMasterImportCell(row, aliases);
  const text = (...aliases) => masterImportText(get(...aliases));
  const warnings = [];
  const organizationName = text("Guest Group Name", "Group Name", "Organization Name", "Name");
  // Totals, repeated headers, and blank separator rows are not guest bookings.
  if (!organizationName || /^(?:totals?|subtotals?|grand total|guest group name|name)\s*:?$/i.test(organizationName)) return null;
  const arrival = parseMasterImportDate(get("Arrival Date", "Start Date", "Check In", "Check-in"), year, warnings, "Arrival date");
  let departureValue = get("Departure Date", "End Date", "Check Out", "Check-out");
  if (masterImportText(departureValue) === "" && year === 2026 && hasMasterImportHeader(row, ["boys)"])) {
    departureValue = get("boys)");
  }
  const departure = parseMasterImportDate(departureValue, year, warnings, "Departure date");
  if (arrival.date && departure.date && departure.date < arrival.date) warnings.push("Departure is before arrival; check the source dates.");
  const contactName = text("Guest Name/Group Leader Name", "Group Leader/Contact Person", "Contact Person", "Group Leader", "Contact Name");
  const phone = text("Group Leader Phone #", "Group Leader #", "Contact Person Cell #", "Contact Person Cell", "Phone Number", "Phone");
  const email = text("Contact Person Email", "Email Address", "Email");
  const guestText = text("Total # of Guests", "Actual Number of Guests", "Actual # of Guests", "# of Guests", "Estimated # of Guests", "Estimated Number of Guests", "Size", "Group Size");
  const guestRange = guestText.match(/^\s*(\d+)\s*[-–—]\s*(\d+)\s*$/);
  const leadingGuests = guestText.match(/^\s*(\d+)(?:\s|\(|$)/);
  const explicitActual = text("Total # of Guests", "Actual Number of Guests", "Actual # of Guests");
  const estimated = year === 2027 && explicitActual === "";
  const guestCount = masterImportUnknown(guestText) ? "" : guestRange ? `${guestRange[1]}-${guestRange[2]}` : masterImportNumber(guestText) || leadingGuests?.[1] || guestText;
  const persons = text("#Persons", "Persons");
  const attendeeCount = guestCount || persons;
  const buildingsRooms = text("Buildings/Rooms", "Buildings", "Rooms", "Lodging");
  const lodgingText = buildingsRooms.replace(/\bGH\b/gi, "Guest House");
  const rawMeals = text("Meals", "Meal Plan");
  const needToKnow = text("Need to know", "Need To Know");
  const allergies = text("Food Allergies", "Allergies");
  const activityText = text("Activities", "Schedule/Activities");
  const schedule = text("Schedule");
  const linenText = text("Linen Sets", "Linens");
  const sourceNotes = text("Notes");
  const stage = text("Stage of Group", "Stage");
  const confirmed = text("Confirmed or Unconfirmed", "Confirmation Status", "Status");
  const cancellationDate = parseMasterImportDate(get("Date of Cancellation", "Cancellation Date"), year, warnings, "Cancellation date").date;
  const rawCancellationReason = text("Reason for Cancellation", "Cancellation Reason");
  const cancellationReason = masterImportUnknown(rawCancellationReason) ? "" : rawCancellationReason;
  const contractSent = get("Contract sent?", "Contract Sent", "Contract Sent Date");
  const contractReturned = get("Contract Signed & Returned?", "Contract Returned", "Contract Returned Date");
  const depositStatus = get("Deposit Received", "$250 Deposit for 2027 Rec'd?", "$250 Deposit for 2027 Received?");
  const rawDeposit = get("Deposit", "Deposit Amount");
  const deposit = masterImportNumber(rawDeposit) || (year === 2027 && masterImportText(depositStatus) && !masterImportUnknown(depositStatus) ? "250" : "");
  const nightValue = get("#Nights", "# of Nights", "Nights");
  const calculatedNights = arrival.date && departure.date && departure.date >= arrival.date
    ? String(Math.round((Date.parse(`${departure.date}T00:00:00Z`) - Date.parse(`${arrival.date}T00:00:00Z`)) / 86400000))
    : "";
  const nights = masterImportNumber(nightValue) || calculatedNights;
  if (masterImportNumber(nightValue) !== "" && calculatedNights !== "" && Number(nights) !== Number(calculatedNights)) {
    warnings.push(`The spreadsheet lists ${nights} night(s), while the dates span ${calculatedNights}; the spreadsheet count is retained.`);
  }
  const mealPlan = parseMasterImportMeals(rawMeals, arrival.date, departure.date, get("#Meals", "Meals Count", "Number of Meals"), warnings);
  const statusValues = { confirmed, stage, cancellationDate, cancellationReason, contractSent, contractReturned, year };
  const status = getMasterImportStatus(statusValues);
  const statusSource = getExplicitMasterImportStatus(statusValues) ? "sheet" : "default";
  const minGuests = text("Min. Number of Paying Guests", "Minimum Number of Paying Guests", "Minimum Guarantee");
  const maxGuests = text("Max. Number of Paying Guests", "Maximum Number of Paying Guests", "Maximum Guarantee");
  const adultRate = text("Adult Guest Rate", "Guest Rate", "Adult Rate Quoted");
  const childRate = text("Child 3 to 17 Rate", "Child Guest Rate", "Child Rate", "Child Rate Quoted");
  const toddlerRate = text("Child 1 to 3 Rate", "Child Under 3 Rate");
  const details = {
    organizationName, retreatType: text("Guest Group Type", "Retreat Type"),
    startDate: arrival.date, endDate: departure.date,
    contactName, phone, email, status,
    importedGuestCountKind: estimated ? "estimated" : "recorded",
    importedGuestCountText: guestText,
    importedLodgingText: buildingsRooms,
    importedLinenText: linenText,
    importedMealText: rawMeals,
    importedContractSentStatus: masterImportText(contractSent),
    importedContractReturnedStatus: masterImportText(contractReturned),
    importedDepositStatus: masterImportText(depositStatus),
    importedStatusSource: statusSource,
    importWarnings: warnings,
  };
  const put = (key, value) => { if (value !== "" && value !== null && value !== undefined) details[key] = value; };
  put("approxTotalGuests", attendeeCount);
  put("minimumGuarantee", masterImportNumber(minGuests));
  put("maximumGuarantee", masterImportNumber(maxGuests));
  put("actualAdultGuests", masterImportNumber(get("Actual # of Adults", "Actual Adults")));
  put("actualChildren3to17", masterImportNumber(get("Actual # of Minors 3 to 17", "Actual Children 3 to 17", "Actual Children 3-17")));
  put("actualChildrenUnder3", masterImportNumber(get("Actual # of Minors under 3", "Actual Children Under 3")));
  put("approxAdultGuests", masterImportNumber(get("Approx. # of Adults", "Estimated # of Adults", "Approx Adults")));
  put("approxChildren3to17", masterImportNumber(get("Approx. # of Minors 3 to 17", "Estimated # of Minors 3 to 17")));
  put("approxChildrenUnder3", masterImportNumber(get("Approx. # of Minors under 3", "Estimated # of Minors under 3")));
  put("dayCamperCount", masterImportNumber(get("Actual # of Day Use Guests", "Day Use Guests", "Day Camper Count")));
  // Prose totals are kept intact. Only explicit adult/toddler categories are mapped.
  if (year === 2026 && !guestRange) {
    const overnightText = guestText.split(/\bplus\b|\bday[ -]?use\b/i)[0];
    if (!details.actualAdultGuests) put("actualAdultGuests", overnightText.match(/\b(\d+)\s+adults?\b/i)?.[1] || "");
    if (!details.actualChildrenUnder3) put("actualChildrenUnder3", overnightText.match(/\b(\d+)\s+(?:inf\s*\/\s*todd|infants?\s*(?:and|&)\s*toddlers?|under[ -]?3)\b/i)?.[1] || "");
    const dayUse = guestText.match(/\bplus\s+(\d+)\s+adults?\s*(?:&|and)\s*(\d+)\s+(?:kids?|children)\s+for\s+day[ -]?use/i);
    if (!details.dayCamperCount && dayUse) put("dayCamperCount", String(Number(dayUse[1]) + Number(dayUse[2])));
    const dayMeals = guestText.match(/day[ -]?use[^.]*?\b(\d+)\s+meals?\b/i);
    put("dayCamperMeals", dayMeals?.[1] || "");
    if (/\b\d+\s+(?:child(?:ren)?|kids?|students?)\b/i.test(overnightText)) {
      warnings.push("The guest description includes children/students without exact age categories. Their original count is retained; check the age breakdown before editing the booking.");
    }
  }
  put("dayCamperMeals", masterImportNumber(get("Day Camper Meals", "Meals per Day Camper")));
  put("adultRateQuoted", masterImportNumber(adultRate));
  put("childRateQuoted", masterImportNumber(childRate));
  put("childUnder3RateQuoted", masterImportNumber(toddlerRate));
  put("numberOfNights", nights);
  put("numberOfMeals", mealPlan.count);
  put("arrivalTime", arrival.time);
  put("departureTime", departure.time);
  put("contractSentDate", masterImportDocumentDate(contractSent, year));
  put("contractReturnedDate", masterImportDocumentDate(contractReturned, year));
  put("inquiryDate", masterImportDocumentDate(get("Inquiry Date"), year));
  put("returnContractByDate", masterImportDocumentDate(get("Return Contract By", "Return Contract By Date"), year));
  put("depositReceivedDate", masterImportDocumentDate(depositStatus, year));
  put("depositAmount", masterImportNumber(deposit));
  put("insuranceCertificateDate", masterImportDocumentDate(get("Insurance Certificate Date"), year));
  put("notificationDate", masterImportDocumentDate(get("Notification Date"), year));
  put("paymentMethod", text("Payment Method"));
  put("ethnicBreakdown", text("Ethnic Breakdown"));
  put("mealSchedule", Object.keys(mealPlan.mealSchedule).length ? mealPlan.mealSchedule : "");
  put("firstMeal", mealPlan.firstMeal);
  put("lastMeal", mealPlan.lastMeal);
  put("mealNotes", [rawMeals, text("Snack for arrival?") ? `Snack for arrival: ${text("Snack for arrival?")}` : "", needToKnow].filter(Boolean).join("\n"));
  put("allergyNotes", allergies);
  put("activityNotes", [activityText, schedule].filter(Boolean).join("\n"));
  put("notes", sourceNotes);
  Object.assign(details, parseMasterImportLinens(linenText));
  put("linenPieces", masterImportNumber(get("Linen Pieces")));
  const lodgingFields = {
    lodgingBethel: ["Lodging Bethel", "Bethel Guests"],
    lodgingHebronThird: ["Lodging Hebron Third", "Hebron 3rd Floor Guests"],
    lodgingHebronBunks: ["Lodging Hebron Bunks", "Hebron Bunks Guests"],
    lodgingDothan: ["Lodging Dothan", "Dothan Guests"],
    lodgingAjalon: ["Lodging Ajalon", "Ajalon Guests"],
    lodgingCapernaum: ["Lodging Capernaum", "Capernaum Guests"],
    lodgingGuestHouse: ["Lodging Guest House", "Guest House Guests"],
  };
  Object.entries(lodgingFields).forEach(([key, aliases]) => put(key, masterImportNumber(get(...aliases))));
  const booking = {
    sourceType: `Master ${year}`, detectedImportType: `Master ${year}`,
    sourceSheet: row.sourceSheet || "", sourceRowNumber: row.sourceRowNumber || index + 2,
    rawSpreadsheetData: { ...row }, rentalFormDetails: details,
    submittedAt: new Date().toISOString(), organizationName,
    name: contactName, contactName: contactName || "", email, phone,
    startDate: arrival.date, endDate: departure.date,
    desiredDatesText: [arrival.date, departure.date].filter(Boolean).join(" - "),
    attendeeCount, groupSize: attendeeCount, retreatType: details.retreatType,
    roomName: lodgingText || "Unassigned", buildingsRooms: lodgingText,
    notes: sourceNotes, message: sourceNotes,
    status, waitlist: status === "Waitlist" ? "Yes" : "No", promoCode: "",
    returningStatus: text("Returning (R) or New (N)", "Returning or New"),
    meals: mealPlan.summary, foodAllergies: allergies, needToKnow, linenSets: linenText,
    linenPieces: text("Linen Pieces"), activities: activityText, schedule,
    persons, nights, mealCount: mealPlan.count,
    camperDays: text("Camper Days (nightsX0.4 + mealsX0.2)", "Camper Days"),
    usageFee: text("Usage Fee"), lodgingCost: text("$ Lodging", "Lodging Cost"),
    foodCost: text("$ Food", "Food Cost"), miscCost: text("$ Misc.", "$ Misc", "Misc"),
    stageOfGroup: stage, minPayingGuests: masterImportNumber(minGuests), maxPayingGuests: masterImportNumber(maxGuests),
    guestRate: masterImportNumber(adultRate),
    expectedMinimumRevenue: text("Exp. Minimum Revenue (inc. dep.)", "Exp. Minimum Revenue", "Exp. Minimum Revenue for Lodging/Meals", "Expected Minimum Revenue", "Expected Minimum Revenue for Lodging/Meals"),
    invoiceLodgingMeals: text("Actual Invoice", "Invoice for Lodging/Meals (does not include linens's fees or other service fees)", "Invoice for Lodging/Meals", "Invoice Total"),
    deposit, depositReceived: masterImportText(depositStatus),
    dateOfCancellation: cancellationDate, reasonForCancellation: cancellationReason,
    vacancyFilled: text("Vacancy filled by another group?"),
    monthlyProjectedIncome: text("Monthly Sum of Projected Income"),
  };
  booking.id = createMasterImportId(booking);
  return booking;
}

export function getBookingImportRowsFromWorksheet(worksheet) {
  let headerRowNumber = 0;
  let headers = [];
  const limit = Math.min(worksheet.rowCount || 25, 25);
  for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
    const candidate = [];
    worksheet.getRow(rowNumber).eachCell((cell, column) => {
      const label = masterImportText(cell.value);
      if (label) candidate.push({ label, column });
    });
    const probe = Object.fromEntries(candidate.map(({ label }) => [label, ""]));
    if (hasMasterImportHeader(probe, ["Guest Group Name", "Group Name", "Name", "Organization Name"]) &&
        hasMasterImportHeader(probe, ["Arrival Date", "Start Date", "Check In"])) {
      headerRowNumber = rowNumber;
      headers = candidate;
      break;
    }
  }
  if (!headerRowNumber) return getRowsFromWorksheetFlexible(worksheet);
  const seen = new Map();
  headers = headers.map(({ label, column }) => {
    const number = (seen.get(label) || 0) + 1;
    seen.set(label, number);
    return { label: number === 1 ? label : `${label} (${number})`, column };
  });
  const rows = [];
  worksheet.eachRow((worksheetRow, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const row = {};
    headers.forEach(({ label, column }) => { row[label] = masterImportCellValue(worksheetRow.getCell(column).value); });
    if (!headers.some(({ label }) => masterImportText(row[label]) !== "")) return;
    rows.push({ ...row, sourceSheet: worksheet.name, sourceRowNumber: rowNumber });
  });
  return rows;
}

/*
  Rebuilds what an earlier import wrote, from the sheet row saved with the
  record, for records imported before importBaseline existed.
*/
export function rebuildMasterImportBaseline(existing) {
  const year = Number(String(existing.sourceType || "").match(/20\d{2}/)?.[0]);
  const raw = existing.rawSpreadsheetData;
  if (!year || !raw || typeof raw !== "object") return null;
  const index = Math.max(0, Number(existing.sourceRowNumber || 2) - 2);
  return normalizeMasterImportRow(raw, index, year);
}

export function masterImportRecordsEqual(existing, merged) {
  const comparable = (booking) => {
    const details = { ...(booking.rentalFormDetails || {}) };
    delete details.importBaseline;
    return JSON.stringify({ ...booking, rentalFormDetails: details, rawSpreadsheetData: null });
  };
  return comparable(existing) === comparable(merged);
}

export function prepareMasterImportUpdates(incomingRows, existingRows) {
  const existingMasters = existingRows.filter((booking) => getMasterImportIdentity(booking));
  const seenBookings = new Set();
  const usedIds = new Set();
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const keptAppValues = [];
  let duplicateRowsSkipped = 0;
  let duplicateExistingRecords = 0;
  const rows = incomingRows.flatMap((incoming) => {
    const identity = getMasterImportIdentity(incoming);
    if (!identity) return incoming;
    // Keep the first row for a group/stay, including copies with another contact.
    // Undated rows retain their contact identity to avoid merging separate requests.
    const duplicateKey = incoming.startDate && incoming.endDate
      ? getMasterImportIdentity(incoming, false)
      : identity;
    if (seenBookings.has(duplicateKey)) {
      duplicateRowsSkipped += 1;
      return [];
    }

    // The import ID is derived from the sheet row, so it still matches after
    // staff change the group name or dates in the app.
    const byId = existingMasters.filter((booking) => booking.id === incoming.id);
    const exact = existingMasters.filter((booking) => getMasterImportIdentity(booking) === getMasterImportIdentity(incoming));
    const sameStay = existingMasters.filter((booking) => getMasterImportIdentity(booking, false) === getMasterImportIdentity(incoming, false));
    const matches = byId.length ? byId : exact.length ? exact : sameStay;
    // Prefer the stable import ID when it exists; otherwise update one match.
    const existing = matches.find((booking) => booking.id === incoming.id) || matches[0];
    const id = existing?.id || incoming.id;
    if (usedIds.has(id)) {
      duplicateRowsSkipped += 1;
      return [];
    }
    // Do not reuse a row-position ID occupied by another stay.
    if (!existing && existingRows.some((booking) => booking.id === id)) {
      throw new Error(`The import ID for ${incoming.organizationName} is already in use. No data was saved.`);
    }
    seenBookings.add(duplicateKey);
    usedIds.add(id);
    // Other stored matches remain available, with their IDs and staff data intact.
    duplicateExistingRecords += Math.max(0, sameStay.length - 1);
    if (!existing) { added += 1; return withImportBaseline(incoming); }
    const { merged, keptAppValues: keptForRow } = mergeMasterImportRecord(existing, incoming, {
      rebuildBaseline: rebuildMasterImportBaseline,
    });
    if (keptForRow.length) {
      keptAppValues.push({ organizationName: existing.organizationName, id: existing.id, fields: keptForRow });
    }
    const mergedDetails = merged.rentalFormDetails;
    const ageCounts = ["actualAdultGuests", "actualChildrenUnder3", "actualChildren3to17"]
      .map((key) => masterImportNumber(mergedDetails[key]));
    const total = masterImportNumber(merged.attendeeCount);
    if (mergedDetails.importedGuestCountKind === "recorded" && total !== "" && ageCounts.some((value) => value !== "")) {
      const knownTotal = ageCounts.reduce((sum, value) => sum + Number(value || 0), 0) +
        (incoming.sourceType === "Master 2025" ? Number(masterImportNumber(mergedDetails.dayCamperCount) || 0) : 0);
      if (knownTotal !== Number(total)) {
        mergedDetails.importWarnings = [...new Set([
          ...(mergedDetails.importWarnings || []),
          "The retained guest age/day-use breakdown does not equal the spreadsheet total. The spreadsheet total is displayed; review the breakdown before editing the booking.",
        ])];
      }
    }
    // Rows the sheet did not change are not rewritten.
    if (masterImportRecordsEqual(existing, merged)) {
      unchanged += 1;
      return [];
    }
    updated += 1;
    return merged;
  });
  return { rows, added, updated, unchanged, keptAppValues, duplicateRowsSkipped, duplicateExistingRecords };
}

export function normalizeMasterSpreadsheetRow(row, index) {
  return normalizeMasterImportRow(row, index, 2025);
}

export function normalizeMaster2026SpreadsheetRow(row, index) {
  return normalizeMasterImportRow(row, index, 2026);
}

export function normalizeMaster2027SpreadsheetRow(row, index) {
  return normalizeMasterImportRow(row, index, 2027);
}
