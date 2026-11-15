/*
  Month-calendar bar layout shared by the office calendar (BookingCalendar)
  and the staff app calendar: one segment per stay per week, clipped to the
  month, packed into lanes so overlapping stays never cover each other.
*/
import { addDays, daysBetween, datesOverlap, getLocalDate, maxDate, minDate } from "./dateUtils";

export function getWeekEventSegments({
  weekIndex,
  datedInquiries,
  selectedYear,
  selectedMonth,
}) {
  const firstDayOffset = new Date(
    selectedYear,
    selectedMonth,
    1
  ).getDay();

  const weekStart = new Date(
    selectedYear,
    selectedMonth,
    1 - firstDayOffset + weekIndex * 7
  );

  const weekEnd = addDays(weekStart, 6);

  const monthStart = new Date(selectedYear, selectedMonth, 1);
  const monthEnd = new Date(selectedYear, selectedMonth + 1, 0);

  const rawSegments = datedInquiries
    .map((inquiry) => {
      const eventStart = getLocalDate(inquiry.startDate);

      const eventEnd = inquiry.endDate
        ? getLocalDate(inquiry.endDate)
        : eventStart;

      if (!eventStart || !eventEnd) {
        return null;
      }

      if (!datesOverlap(eventStart, eventEnd, weekStart, weekEnd)) {
        return null;
      }

      if (!datesOverlap(eventStart, eventEnd, monthStart, monthEnd)) {
        return null;
      }

      const segmentStart = maxDate(
        eventStart,
        weekStart,
        monthStart
      );

      const segmentEnd = minDate(
        eventEnd,
        weekEnd,
        monthEnd
      );

      const startColumn = segmentStart.getDay() + 1;

      const spanDays =
        daysBetween(segmentStart, segmentEnd) + 1;

      return {
        inquiry,
        segmentStart,
        segmentEnd,
        startColumn,
        spanDays,
        endColumn: startColumn + spanDays - 1,
        startsHere:
          segmentStart.getTime() === eventStart.getTime(),
        endsHere:
          segmentEnd.getTime() === eventEnd.getTime(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.segmentStart - b.segmentStart !== 0) {
        return a.segmentStart - b.segmentStart;
      }

      return b.spanDays - a.spanDays;
    });

  const laneEndColumns = [];

  return rawSegments.map((segment) => {
    const existingLaneIndex =
      laneEndColumns.findIndex(
        (endColumn) =>
          segment.startColumn > endColumn
      );

    const lane =
      existingLaneIndex === -1
        ? laneEndColumns.length
        : existingLaneIndex;

    laneEndColumns[lane] = segment.endColumn;

    return {
      ...segment,
      lane,
    };
  });
}
