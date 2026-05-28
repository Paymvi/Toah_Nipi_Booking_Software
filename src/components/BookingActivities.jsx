import { useMemo, useState } from "react";
import {
  FaCalendarAlt,
  FaClipboardList,
  FaEdit,
  FaPlus,
  FaTrashAlt,
  FaUtensils,
  FaRunning,
  FaUsers,
  FaBoxOpen,
  FaUserTie,
  FaSave,
  FaTimes,
} from "react-icons/fa";

const emptyActivity = {
  activityName: "",
  activityDate: "",
  location: "",
  capacity: "",
  rate: "",
  tasks: "",
  inventory: "",
  staff: "",
};

const defaultActivities = {
  meals: [],
  recreation: [],
};

export default function BookingActivities({
  initialActivities = defaultActivities,
  onActivitiesChange,
}) {
  const [activeTab, setActiveTab] = useState("meals");
  const [activities, setActivities] = useState({
    meals: initialActivities.meals || [],
    recreation: initialActivities.recreation || [],
  });

  const [editingId, setEditingId] = useState(null);
  const [draftActivity, setDraftActivity] = useState(emptyActivity);
  const [isAdding, setIsAdding] = useState(false);

  const currentActivities = activities[activeTab] || [];

  const tabConfig = {
    meals: {
      label: "Meals",
      icon: <FaUtensils />,
      singular: "Meal",
    },
    recreation: {
      label: "Recreation",
      icon: <FaRunning />,
      singular: "Activity",
    },
  };

  const summary = useMemo(() => {
    const totalActivities = currentActivities.length;

    const totalCapacity = currentActivities.reduce((total, item) => {
      const capacity = Number(item.capacity);
      return total + (Number.isNaN(capacity) ? 0 : capacity);
    }, 0);

    const totalStaff = currentActivities.reduce((total, item) => {
      const staff = Number(item.staff);
      return total + (Number.isNaN(staff) ? 0 : staff);
    }, 0);

    return {
      totalActivities,
      totalCapacity,
      totalStaff,
    };
  }, [currentActivities]);

  const updateActivities = (updatedActivities) => {
    setActivities(updatedActivities);

    if (onActivitiesChange) {
      onActivitiesChange(updatedActivities);
    }
  };

  const handleDraftChange = (event) => {
    const { name, value } = event.target;

    setDraftActivity((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddClick = () => {
    setIsAdding(true);
    setEditingId(null);
    setDraftActivity(emptyActivity);
  };

  const handleEditClick = (activity) => {
    setIsAdding(false);
    setEditingId(activity.id);
    setDraftActivity({
      activityName: activity.activityName || "",
      activityDate: activity.activityDate || "",
      location: activity.location || "",
      capacity: activity.capacity || "",
      rate: activity.rate || "",
      tasks: activity.tasks || "",
      inventory: activity.inventory || "",
      staff: activity.staff || "",
    });
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setDraftActivity(emptyActivity);
  };

  const handleSave = () => {
    if (!draftActivity.activityName.trim()) {
      return;
    }

    const activityToSave = {
      ...draftActivity,
      id: editingId || crypto.randomUUID(),
    };

    const updatedTabActivities = editingId
      ? currentActivities.map((activity) =>
          activity.id === editingId ? activityToSave : activity
        )
      : [...currentActivities, activityToSave];

    updateActivities({
      ...activities,
      [activeTab]: updatedTabActivities,
    });

    handleCancel();
  };

  const handleDelete = (activityId) => {
    const updatedTabActivities = currentActivities.filter(
      (activity) => activity.id !== activityId
    );

    updateActivities({
      ...activities,
      [activeTab]: updatedTabActivities,
    });

    if (editingId === activityId) {
      handleCancel();
    }
  };

  const buildRequirementText = (activity) => {
    const parts = [];

    if (activity.tasks) {
      parts.push(`Tasks${activity.tasks !== "0" ? ` (${activity.tasks})` : ""}`);
    }

    if (activity.inventory) {
      parts.push(
        `Inventory${activity.inventory !== "0" ? ` (${activity.inventory})` : ""}`
      );
    }

    if (activity.staff) {
      parts.push(`Staff${activity.staff !== "0" ? ` (${activity.staff})` : ""}`);
    }

    return parts.length > 0 ? parts.join(", ") : "No requirements";
  };

  return (
    <section className="booking-activities">
      <div className="booking-activities__header">
        <div>
          <p className="booking-activities__eyebrow">Booking Activities</p>
          <h2>Meals & Recreation</h2>
          <p>
            Manage scheduled meals and recreation options attached to this
            booking.
          </p>
        </div>

        <button className="activity-primary-btn" onClick={handleAddClick}>
          <FaPlus />
          Add {tabConfig[activeTab].singular}
        </button>
      </div>

      <div className="activity-tabs">
        {Object.entries(tabConfig).map(([key, tab]) => (
          <button
            key={key}
            className={`activity-tab ${activeTab === key ? "active" : ""}`}
            onClick={() => {
              setActiveTab(key);
              handleCancel();
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="activity-summary-grid">
        <div className="activity-summary-card">
          <span>
            <FaClipboardList />
          </span>
          <div>
            <p>Total Scheduled</p>
            <h3>{summary.totalActivities}</h3>
          </div>
        </div>

        <div className="activity-summary-card">
          <span>
            <FaUsers />
          </span>
          <div>
            <p>Total Capacity</p>
            <h3>{summary.totalCapacity}</h3>
          </div>
        </div>

        <div className="activity-summary-card">
          <span>
            <FaUserTie />
          </span>
          <div>
            <p>Staff Needed</p>
            <h3>{summary.totalStaff}</h3>
          </div>
        </div>
      </div>

      <div className="activity-panel">
        <div className="activity-panel__top">
          <div>
            <h3>{tabConfig[activeTab].label}</h3>
            <p>
              {currentActivities.length === 0
                ? "No activities have been added yet."
                : `${currentActivities.length} scheduled item${
                    currentActivities.length === 1 ? "" : "s"
                  }`}
            </p>
          </div>
        </div>

        {isAdding && (
          <ActivityEditorRow
            draftActivity={draftActivity}
            onChange={handleDraftChange}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        )}

        <div className="activity-table-wrap">
          <table className="activity-table">
            <thead>
              <tr>
                <th>Activity</th>
                <th>Date / Time</th>
                <th>Location</th>
                <th>Capacity</th>
                <th>Rate</th>
                <th>Requirements</th>
                <th className="activity-table__actions">Actions</th>
              </tr>
            </thead>

            <tbody>
              {currentActivities.length === 0 && !isAdding ? (
                <tr>
                  <td colSpan="7">
                    <div className="activity-empty-state">
                      <FaCalendarAlt />
                      <h4>No {tabConfig[activeTab].label.toLowerCase()} yet</h4>
                      <p>
                        Add a {tabConfig[activeTab].singular.toLowerCase()} to
                        start building this booking schedule.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                currentActivities.map((activity) =>
                  editingId === activity.id ? (
                    <ActivityEditorRow
                      key={activity.id}
                      draftActivity={draftActivity}
                      onChange={handleDraftChange}
                      onSave={handleSave}
                      onCancel={handleCancel}
                      isTableRow
                    />
                  ) : (
                    <tr key={activity.id}>
                      <td>
                        <strong>{activity.activityName || "Untitled"}</strong>
                      </td>

                      <td>{activity.activityDate || "Not scheduled"}</td>

                      <td>{activity.location || "No location"}</td>

                      <td>{activity.capacity || "—"}</td>

                      <td>{activity.rate || "—"}</td>

                      <td>
                        <span className="activity-requirement-pill">
                          {buildRequirementText(activity)}
                        </span>
                      </td>

                      <td>
                        <div className="activity-row-actions">
                          <button
                            className="activity-icon-btn"
                            onClick={() => handleEditClick(activity)}
                            aria-label="Edit activity"
                          >
                            <FaEdit />
                          </button>

                          <button
                            className="activity-icon-btn danger"
                            onClick={() => handleDelete(activity.id)}
                            aria-label="Delete activity"
                          >
                            <FaTrashAlt />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ActivityEditorRow({
  draftActivity,
  onChange,
  onSave,
  onCancel,
  isTableRow = false,
}) {
  const editorContent = (
    <>
      <td>
        <input
          name="activityName"
          value={draftActivity.activityName}
          onChange={onChange}
          placeholder="Dinner, Pool, Ropes Course..."
        />
      </td>

      <td>
        <input
          name="activityDate"
          value={draftActivity.activityDate}
          onChange={onChange}
          placeholder="2026-01-04 4:00 PM-5:00 PM"
        />
      </td>

      <td>
        <input
          name="location"
          value={draftActivity.location}
          onChange={onChange}
          placeholder="Dining Hall"
        />
      </td>

      <td>
        <input
          name="capacity"
          value={draftActivity.capacity}
          onChange={onChange}
          placeholder="57"
        />
      </td>

      <td>
        <input
          name="rate"
          value={draftActivity.rate}
          onChange={onChange}
          placeholder="$8.00"
        />
      </td>

      <td>
        <div className="activity-mini-inputs">
          <label>
            <FaClipboardList />
            <input
              name="tasks"
              value={draftActivity.tasks}
              onChange={onChange}
              placeholder="Tasks"
            />
          </label>

          <label>
            <FaBoxOpen />
            <input
              name="inventory"
              value={draftActivity.inventory}
              onChange={onChange}
              placeholder="Inventory"
            />
          </label>

          <label>
            <FaUserTie />
            <input
              name="staff"
              value={draftActivity.staff}
              onChange={onChange}
              placeholder="Staff"
            />
          </label>
        </div>
      </td>

      <td>
        <div className="activity-row-actions">
          <button className="activity-icon-btn save" onClick={onSave}>
            <FaSave />
          </button>

          <button className="activity-icon-btn" onClick={onCancel}>
            <FaTimes />
          </button>
        </div>
      </td>
    </>
  );

  if (isTableRow) {
    return <tr className="activity-edit-row">{editorContent}</tr>;
  }

  return (
    <div className="activity-add-card">
      <div className="activity-add-card__header">
        <h4>Add Activity</h4>
        <button onClick={onCancel}>
          <FaTimes />
        </button>
      </div>

      <div className="activity-add-grid">
        <label>
          Activity Name
          <input
            name="activityName"
            value={draftActivity.activityName}
            onChange={onChange}
            placeholder="Dinner, Pool, Ropes Course..."
          />
        </label>

        <label>
          Date / Time
          <input
            name="activityDate"
            value={draftActivity.activityDate}
            onChange={onChange}
            placeholder="2026-01-04 4:00 PM-5:00 PM"
          />
        </label>

        <label>
          Location
          <input
            name="location"
            value={draftActivity.location}
            onChange={onChange}
            placeholder="Dining Hall"
          />
        </label>

        <label>
          Capacity
          <input
            name="capacity"
            value={draftActivity.capacity}
            onChange={onChange}
            placeholder="57"
          />
        </label>

        <label>
          Rate
          <input
            name="rate"
            value={draftActivity.rate}
            onChange={onChange}
            placeholder="$8.00"
          />
        </label>

        <label>
          Tasks
          <input
            name="tasks"
            value={draftActivity.tasks}
            onChange={onChange}
            placeholder="1"
          />
        </label>

        <label>
          Inventory
          <input
            name="inventory"
            value={draftActivity.inventory}
            onChange={onChange}
            placeholder="1"
          />
        </label>

        <label>
          Staff
          <input
            name="staff"
            value={draftActivity.staff}
            onChange={onChange}
            placeholder="2"
          />
        </label>
      </div>

      <div className="activity-add-card__actions">
        <button className="activity-secondary-btn" onClick={onCancel}>
          Cancel
        </button>

        <button className="activity-primary-btn" onClick={onSave}>
          <FaSave />
          Save Activity
        </button>
      </div>
    </div>
  );
}