import {
  FaCalendarAlt,
  FaClipboardList,
  FaClock,
  FaInfoCircle,
  FaUtensils,
  FaConciergeBell,
  FaStickyNote,
  FaShieldAlt,
} from "react-icons/fa";
import { getLegacyBookingNotes, isNoteTextShown } from "../../utils/legacyBookingNotes";
import {
  formatMealTime as formatBookingOverviewTime,
  parseBookingDietarySummary,
  parseBookingMealSummary,
} from "../../utils/mealPlan";
import { getOverviewDisplayValue, hasOverviewDisplayValue } from "./bookingOverviewValues";
import {
  BookingOverviewLargeSection,
  BookingOverviewEmptyRow,
  BookingOverviewEditButton,
  BookingOverviewSection,
} from "./BookingOverviewParts";

export default function BookingMealsProgramOverview({
  booking,
  details,
  setActiveTab,
  isLarge = false,
}) {
  const mealPlanText = getOverviewDisplayValue(
    booking.meals
  );

  const dietaryText = getOverviewDisplayValue(
    booking.foodAllergies
  );

  const mealNotesText = getOverviewDisplayValue(
    details?.mealNotes
  );

  // Master imports copy Need To Know into the meal notes; show it once.
  const needToKnowText = isNoteTextShown(
    booking.needToKnow,
    details?.mealNotes
  )
    ? ""
    : getOverviewDisplayValue(booking.needToKnow);

  const legacyMealNotes = getLegacyBookingNotes(booking).meals;

  const parsedMealSummary =
    parseBookingMealSummary(mealPlanText);

  const parsedDietarySummary =
    parseBookingDietarySummary(dietaryText);

  const totalMeals =
    getOverviewDisplayValue(
      details?.numberOfMeals,
      parsedMealSummary.totalMeals,
      booking.mealCount
    );

  const firstMeal =
    getOverviewDisplayValue(
      details?.firstMeal,
      parsedMealSummary.firstMeal
    );

  const lastMeal =
    getOverviewDisplayValue(
      details?.lastMeal,
      parsedMealSummary.lastMeal
    );

  const serviceTimes = [
    {
      label: "Breakfast",
      time: getOverviewDisplayValue(
        details?.breakfastTime,
        parsedMealSummary.breakfastTime
      ),
    },
    {
      label: "Lunch",
      time: getOverviewDisplayValue(
        details?.lunchTime,
        parsedMealSummary.lunchTime
      ),
    },
    {
      label: "Dinner",
      time: getOverviewDisplayValue(
        details?.dinnerTime,
        parsedMealSummary.dinnerTime
      ),
    },
  ];

  const hasMealSummary =
    hasOverviewDisplayValue(totalMeals) ||
    hasOverviewDisplayValue(firstMeal) ||
    hasOverviewDisplayValue(lastMeal) ||
    serviceTimes.some(({ time }) => hasOverviewDisplayValue(time));

  const hasDietaryAlerts =
    parsedDietarySummary.items.length > 0 ||
    Boolean(parsedDietarySummary.additionalNotes);

  const hasAnyContent =
    hasOverviewDisplayValue(mealPlanText) ||
    hasDietaryAlerts ||
    hasOverviewDisplayValue(mealNotesText) ||
    hasOverviewDisplayValue(needToKnowText) ||
    legacyMealNotes.length > 0 ||
    hasMealSummary;

  if (!hasAnyContent) {
    return isLarge ? (
      <BookingOverviewLargeSection
        icon={FaUtensils}
        eyebrow="Food Service"
        title="Meals"
        wide
      >
        <div className="booking-overview-program-empty">
          No meal information has been added yet.
        </div>
      </BookingOverviewLargeSection>
    ) : (
      <BookingOverviewEmptyRow
        icon={FaUtensils}
        title="Meals"
        explanation="Meal schedule, service times, dietary alerts and food-service notes added in Create Booking will appear here."
        action={<BookingOverviewEditButton setActiveTab={setActiveTab} />}
      />
    );
  }

  const emptyPanelAction = !isLarge && (
    <BookingOverviewEditButton setActiveTab={setActiveTab} />
  );

  const mealContent = (
    <>
      {(isLarge || hasMealSummary) && (
        <div className="booking-overview-program-summary">
          <div className="booking-overview-program-summary-block">
            <span className="booking-overview-program-summary-icon">
              <FaUtensils />
            </span>

            <div className="booking-overview-program-summary-copy">
              <small>Total Meals</small>
              <strong>{totalMeals || "—"}</strong>

              {/* The parser defaults per-meal counts to "0", so only trust them when the plan recorded totals. */}
              {parsedMealSummary.totalMeals && (
                <span>
                  (Breakfast: {parsedMealSummary.breakfastCount}, Lunch:{" "}
                  {parsedMealSummary.lunchCount}, Dinner:{" "}
                  {parsedMealSummary.dinnerCount})
                </span>
              )}
            </div>
          </div>

          <div className="booking-overview-program-summary-block">
            <span className="booking-overview-program-summary-icon">
              <FaConciergeBell />
            </span>

            <div className="booking-overview-program-summary-copy">
              <small>First Meal</small>
              <strong>{firstMeal || "—"}</strong>
            </div>
          </div>

          <div className="booking-overview-program-summary-block">
            <span className="booking-overview-program-summary-icon">
              <FaClipboardList />
            </span>

            <div className="booking-overview-program-summary-copy">
              <small>Last Meal</small>
              <strong>{lastMeal || "—"}</strong>
            </div>
          </div>

          <div className="booking-overview-program-summary-block">
            <span className="booking-overview-program-summary-icon">
              <FaClock />
            </span>

            <div className="booking-overview-program-summary-copy">
              <small>Service Times</small>

              <div className="booking-overview-program-service-times">
                {serviceTimes.map(({ label, time }) => (
                  <div key={label}>
                    <strong>{formatBookingOverviewTime(time) || "—"}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="booking-overview-program-cards-row">
        <div className="booking-overview-program-panel booking-overview-program-panel-meals">
          <div className="booking-overview-program-panel-header">
            <span className="booking-overview-program-panel-icon">
              <FaCalendarAlt />
            </span>

            <div>
              <h4>Meal Service Plan</h4>
              <p>Detailed meal plan for this retreat.</p>
            </div>
          </div>

          {parsedMealSummary.dateRows.length > 0 ? (
            <div className="booking-overview-program-table-wrap">
              <table className="booking-overview-program-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Breakfast</th>
                    <th>Lunch</th>
                    <th>Dinner</th>
                  </tr>
                </thead>

                <tbody>
                  {parsedMealSummary.dateRows.map((row) => (
                    <tr key={row.dateLabel}>
                      <td className="booking-overview-program-date-cell">
                        {row.dateLabel}
                      </td>

                      <td>
                        {row.breakfast ? (
                          <span className="booking-overview-meal-chip">
                            Breakfast
                          </span>
                        ) : (
                          <span className="booking-overview-program-dash">—</span>
                        )}
                      </td>

                      <td>
                        {row.lunch ? (
                          <span className="booking-overview-meal-chip">
                            Lunch
                          </span>
                        ) : (
                          <span className="booking-overview-program-dash">—</span>
                        )}
                      </td>

                      <td>
                        {row.dinner ? (
                          <span className="booking-overview-meal-chip booking-overview-meal-chip-dinner">
                            Dinner
                          </span>
                        ) : (
                          <span className="booking-overview-program-dash">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="booking-overview-program-empty">
              No detailed meal schedule has been added yet.
              {emptyPanelAction}
            </div>
          )}
        </div>

        <div className="booking-overview-program-panel booking-overview-program-panel-diet">
          <div className="booking-overview-program-panel-header">
            <span className="booking-overview-program-panel-icon">
              <FaShieldAlt />
            </span>

            <div>
              <h4>Dietary Alerts</h4>
              <p>Allergen and dietary information for this group.</p>
            </div>
          </div>

          {hasDietaryAlerts ? (
            <div className="booking-overview-dietary-table">
              {parsedDietarySummary.items.length > 0 && (
                <div className="booking-overview-dietary-table-head">
                  <span>Dietary Item</span>
                  <span>Quantity</span>
                </div>
              )}

              {parsedDietarySummary.items.map((item, index) => (
                <div
                  className="booking-overview-dietary-row"
                  key={`${item.label}-${index}`}
                >
                  <span>{item.label}</span>
                  <strong>{item.quantity}</strong>
                </div>
              ))}

              {parsedDietarySummary.additionalNotes && (
                <div className="booking-overview-dietary-alert-note">
                  <strong>Additional Dietary Note</strong>
                  <p>{parsedDietarySummary.additionalNotes}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="booking-overview-program-empty">
              No dietary alerts were added for this booking.
              {emptyPanelAction}
            </div>
          )}
        </div>
      </div>

      {(mealNotesText || needToKnowText || legacyMealNotes.length > 0) && (
        <div className="booking-overview-program-panel booking-overview-program-panel-notes">
          <div className="booking-overview-program-panel-header">
            <span className="booking-overview-program-panel-icon">
              <FaStickyNote />
            </span>

            <div>
              <h4>Meal Notes</h4>
              <p>Important details for food-service coordination.</p>
            </div>
          </div>

          <div className="booking-overview-program-notes-grid">
            {mealNotesText && (
              <div className="booking-overview-program-note-block">
                <div className="booking-overview-program-note-heading">
                  <FaStickyNote />
                  <span>Meal Notes</span>
                </div>

                <p className="booking-overview-program-note-value">
                  {mealNotesText}
                </p>
              </div>
            )}

            {needToKnowText && (
              <div className="booking-overview-program-note-block">
                <div className="booking-overview-program-note-heading">
                  <FaInfoCircle />
                  <span>Need To Know</span>
                </div>

                <p className="booking-overview-program-note-value">
                  {needToKnowText}
                </p>
              </div>
            )}

            {legacyMealNotes.map((note) => (
              <div className="booking-overview-program-note-block" key={note.label}>
                <div className="booking-overview-program-note-heading">
                  <FaClock />
                  <span>{note.label}</span>
                </div>

                <p className="booking-overview-program-note-value">
                  {note.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  if (!isLarge) {
    return (
      <BookingOverviewSection icon={FaUtensils} title="Meals">
        <div className="booking-compact-meals">{mealContent}</div>
      </BookingOverviewSection>
    );
  }

  return (
    <section className="booking-overview-card booking-overview-card-wide booking-overview-program-showcase">
      <div className="booking-overview-program-header">
        <div className="booking-overview-program-title">
          <span className="booking-overview-program-title-icon">
            <FaUtensils />
          </span>

          <div>
            <p>Food Service</p>
            <h3>Meals</h3>
            <span>
              Meal schedule, service times, dietary requirements,
              and food-service notes.
            </span>
          </div>
        </div>
      </div>

      {mealContent}
    </section>
  );
}
