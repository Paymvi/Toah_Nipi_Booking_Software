import { FaPlus, FaTrashAlt } from "react-icons/fa";

const housingRows = [
  {
    id: "hebron",
    roomName: "Hebron",
    housingArea: "Main Lodge",
    roomCategory: "Dormitory / Private Rooms",
    image: "/lodges/May-2025-Hebron.jpg",
  },
  {
    id: "bethel",
    roomName: "Bethel",
    housingArea: "Bethel Lodge",
    roomCategory: "Family Style Rooms",
    image: "/lodges/Bethel.webp",
  },
  {
    id: "dothan",
    roomName: "Dothan",
    housingArea: "Dothan Lodge",
    roomCategory: "Small Group Lodge",
    image: "/lodges/Dothan.webp",
  },
  {
    id: "guest-house",
    roomName: "Guest House",
    housingArea: "Guest House",
    roomCategory: "House Style Lodging",
    image: "/lodges/Guest-House.webp",
  },
  {
    id: "rustic-cottage-1",
    roomName: "Rustic: Ajalon",
    housingArea: "Rustic Cottages",
    roomCategory: "Rustic Cottage",
    image: "/lodges/Ajalon.png",
  },
  // {
  //   id: "rustic-cottage-2",
  //   roomName: "Rustic: Bezer",
  //   housingArea: "Rustic Cottages",
  //   roomCategory: "Rustic Cottage",
  //   image: "/lodges/Bezer.webp",
  // },
  {
    id: "rustic-cottage-3",
    roomName: "Rustic: Capernaum",
    housingArea: "Rustic Cottages",
    roomCategory: "Rustic Cottage",
    image: "/lodges/Capurnum.webp",
  },
  {
    id: "camping-1",
    roomName: "Tent Camping: Across Ajalon",
    housingArea: "Camping",
    roomCategory: "Camping",
    image: "/lodges/Capurnum.webp",
  },
  {
    id: "camping-2",
    roomName: "Tent Camping: Beach",
    housingArea: "Camping",
    roomCategory: "Camping",
    image: "/lodges/Capurnum.webp",
  },
  {
    id: "camping-3",
    roomName: "Tent Camping: Guest house",
    housingArea: "Camping",
    roomCategory: "Camping",
    image: "/lodges/Capurnum.webp",
  },
  
];

function getBookingGuestCount(booking) {
  const guestText = String(
    booking?.attendeeCount || booking?.groupSize || booking?.persons || ""
  );

  const guestMatch = guestText.match(/\d+/);

  return guestMatch ? Number(guestMatch[0]) : 0;
}

function bookingUsesHousingRow(booking, row) {
  const housingText = [booking?.roomName, booking?.buildingsRooms]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return housingText.includes(row.roomName.toLowerCase());
}

export default function BookingHousingTab({ booking }) {
  const guestCount = getBookingGuestCount(booking);

  return (
    <section className="dashboard-card booking-housing-tab-card">
      <div className="booking-housing-tab-header">
        <div>
          <h3>Housing</h3>
          <p>Assign lodging for this booking.</p>
        </div>

        <button className="primary-dashboard-button" type="button">
          <FaPlus />
          Add Room
        </button>
      </div>

      <div className="booking-housing-table-wrap">
        <table className="booking-housing-table">
          <thead>
            <tr>
              <th>Room Name</th>
              <th>Housing Area</th>
              <th>Room Category</th>
              <th>Assigned Attendees</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>

          <tbody>
            {housingRows.map((row) => {
              const isAssigned = bookingUsesHousingRow(booking, row);

              return (
                <tr key={row.id}>
                  <td>
                    <div className="housing-room-cell">
                      <img
                        className="housing-room-thumb"
                        src={row.image}
                        alt={`${row.roomName} lodging`}
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />

                      <strong>{row.roomName}</strong>
                    </div>
                  </td>

                  <td>{row.housingArea}</td>

                  <td>{row.roomCategory}</td>

                  <td>{isAssigned ? guestCount || "Assigned" : 0}</td>

                  <td>
                    <button className="housing-delete-button" type="button">
                      <FaTrashAlt />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}