import { formatDateRange } from "./dateUtils.js";

/*
  Props for a calendar entry that opens its booking. Entries hold block
  content (tooltips, agenda rows), so they stay divs with button semantics.
  The booking is always identified by id: names and dates can repeat.
*/
export function getBookingOpenProps(booking, onOpenBooking) {
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": `Open booking: ${booking.organizationName}, ${formatDateRange(
      booking.startDate,
      booking.endDate
    )}`,
    onClick: (event) => {
      // Dragging to copy text ends in a click; detail is 0 for keyboard clicks.
      if (event.detail > 0 && !window.getSelection().isCollapsed) return;

      onOpenBooking(booking.id);
    },
    onKeyDown: (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;

      event.preventDefault();
      // A real click, so the tutorial's click guard also covers the keyboard.
      event.currentTarget.click();
    },
  };
}
