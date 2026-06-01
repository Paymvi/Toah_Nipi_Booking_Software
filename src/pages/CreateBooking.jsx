import { useState } from "react";

const retreatTypes = [
  "Church Retreat",
  "Student Retreat",
  "Family Retreat",
  "Personal Retreat",
  "Leadership Retreat",
  "Day Visit",
  "Conference",
  "Other",
];

const attendeeCounts = [
  "1-25",
  "26-50",
  "51-100",
  "101-150",
  "151-200",
  "200+",
];

const initialFormState = {
  organizationName: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  startDate: "",
  endDate: "",
  attendeeCount: "",
  retreatType: "",
  promoCode: "",
  notes: "",
};

export default function CreateBooking() {
  const [formData, setFormData] = useState(initialFormState);
  const [wasSubmitted, setWasSubmitted] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const newInquiry = {
      id: window.crypto?.randomUUID?.() || String(Date.now()),
      submittedAt: new Date().toISOString(),

      organizationName: formData.organizationName,
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone,
      startDate: formData.startDate,
      endDate: formData.endDate,
      attendeeCount: formData.attendeeCount,
      retreatType: formData.retreatType,
      promoCode: formData.promoCode,
      notes: formData.notes,
    };

    const existingInquiries =
      JSON.parse(localStorage.getItem("toahNipiPublicInquiries")) || [];

    const updatedInquiries = [newInquiry, ...existingInquiries];

    localStorage.setItem(
      "toahNipiPublicInquiries",
      JSON.stringify(updatedInquiries)
    );

    console.log("Saved inquiry:", newInquiry);

    setWasSubmitted(true);
    setFormData(initialFormState);
  };

  return (
    <main className="rental-page">
      <section className="rental-card">
        <header className="rental-header">
          <h1>Rental Inquiry</h1>
          <p>
            Submit your group details below and the Toah Nipi team will follow
            up with next steps.
          </p>
        </header>

        {wasSubmitted && (
          <div className="success-message">
            <strong>Thank you!</strong>
            <span>Your inquiry has been submitted successfully.</span>
          </div>
        )}

        <form className="rental-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-full">
              <span>Organization Name</span>
              <input
                type="text"
                name="organizationName"
                placeholder="Your-Group-Name"
                value={formData.organizationName}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              <span>First Name</span>
              <input
                type="text"
                name="firstName"
                placeholder="John"
                value={formData.firstName}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              <span>Last Name</span>
              <input
                type="text"
                name="lastName"
                placeholder="Smith"
                value={formData.lastName}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              <span>Email *</span>
              <input
                type="email"
                name="email"
                placeholder="your-email@email.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              <span>Phone</span>
              <input
                type="tel"
                name="phone"
                placeholder="123-456-7890"
                value={formData.phone}
                onChange={handleChange}
              />
            </label>

            <label>
              <span>Start Date</span>
              <input
                type="date"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
              />
            </label>

            <label>
              <span>End Date</span>
              <input
                type="date"
                name="endDate"
                value={formData.endDate}
                onChange={handleChange}
              />
            </label>

            <label>
              <span>Attendee Count Estimate</span>
              <select
                name="attendeeCount"
                value={formData.attendeeCount}
                onChange={handleChange}
              >
                <option value="">Select attendee count</option>

                {attendeeCounts.map((count) => (
                  <option value={count} key={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Type of Retreat</span>
              <select
                name="retreatType"
                value={formData.retreatType}
                onChange={handleChange}
              >
                <option value="">Select retreat type</option>

                {retreatTypes.map((type) => (
                  <option value={type} key={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Promo Code</span>
              <input
                type="text"
                name="promoCode"
                placeholder="If applicable"
                value={formData.promoCode}
                onChange={handleChange}
              />
            </label>

            <label className="form-full">
              <span>Notes/Special Instructions</span>
              <textarea
                name="notes"
                rows="6"
                placeholder="Tell us about lodging needs, meals, meeting spaces, schedule details, accessibility needs, or any questions you have."
                value={formData.notes}
                onChange={handleChange}
              />
            </label>
          </div>

          <div className="form-actions">
            <button type="submit">Submit</button>
          </div>
        </form>
      </section>
    </main>
  );
}