import {
  useEffect,
  useState,
} from "react";

import {
  getGuestInquiries,
} from "../services/guestInquiryService";



export default function GuestInquiriesView() {
  const [
    inquiries,
    setInquiries,
  ] = useState([]);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    loadError,
    setLoadError,
  ] = useState("");


  useEffect(() => {
    loadGuestInquiries();
  }, []);


  async function loadGuestInquiries() {
    try {
      setIsLoading(true);
      setLoadError("");

      const data =
        await getGuestInquiries();

      console.log(
        "Guest inquiries:",
        data
      );

      setInquiries(data);
    } catch (error) {
      console.error(
        "Could not load guest inquiries:",
        error
      );

      setLoadError(
        error?.message ||
          "Could not load guest inquiries."
      );
    } finally {
      setIsLoading(false);
    }
  }


  if (isLoading) {
    return (
      <div>
        Loading guest inquiries...
      </div>
    );
  }


  if (loadError) {
    return (
      <div>
        <strong>
          Could not load guest inquiries
        </strong>

        <p>{loadError}</p>
      </div>
    );
  }


  return (
    <div>
      <h1>
        Guest Inquiries
      </h1>

      <p>
        {inquiries.length} total
        guest inquiry
        {inquiries.length === 1
          ? ""
          : "ies"}
      </p>

      {inquiries.length === 0 ? (
        <p>
          No guest inquiries found.
        </p>
      ) : (
        inquiries.map(
          (inquiry) => (
            <div
              key={inquiry.id}
              style={{
                border:
                  "1px solid #ddd",
                padding: "16px",
                marginBottom: "12px",
              }}
            >
              <strong>
                {
                  inquiry.organization_name
                }
              </strong>

              <div>
                Status:{" "}
                {inquiry.status}
              </div>

              <div>
                Contact:{" "}
                {inquiry.contact_name}
              </div>

              <div>
                {
                  inquiry.start_date
                }
                {" → "}
                {
                  inquiry.end_date
                }
              </div>

              <div>
                Estimated guests:{" "}
                {
                  inquiry.approx_total_guests
                }
              </div>
            </div>
          )
        )
      )}
    </div>
  );
}