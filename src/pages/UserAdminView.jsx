import { useState } from "react";
import { FaPlus, FaTrashAlt, FaUserShield } from "react-icons/fa";
import StaffAccessPanel from "../components/StaffAccessPanel";
import { createStaffUserId, saveCurrentStaffUserId } from "../utils/staffUsers";

export default function UserAdminView({
  staffUsers,
  setStaffUsers,
  currentStaffUserId,
  setCurrentStaffUserId,
  staffDirectoryStatus = { checked: false, shared: false, reason: "" },
  unlistedStaffNames = [],
  onCopyBrowserListToShared,
  isAdmin = false,
}) {
  const [newUserForm, setNewUserForm] = useState({
    name: "",
    email: "",
    role: "Staff",
  });

  const activeUsers = staffUsers.filter((user) => user.active);
  const inactiveUsers = staffUsers.filter((user) => !user.active);

    const updateUsers = (nextUsers) => {
    setStaffUsers(nextUsers);
  };

  const addUnlistedName = (name) => {
    updateUsers([
      ...staffUsers,
      {
        id: createStaffUserId(),
        name,
        email: "",
        role: "Staff",
        active: true,
      },
    ]);
  };

  const updateNewUserField = (fieldName, value) => {
    setNewUserForm((currentForm) => ({
      ...currentForm,
      [fieldName]: value,
    }));
  };

  const handleAddUser = (event) => {
    event.preventDefault();

    const name = newUserForm.name.trim();

    if (!name) {
      return;
    }

    const nextUser = {
      id: createStaffUserId(),
      name,
      email: newUserForm.email.trim(),
      role: newUserForm.role,
      active: true,
    };

        const nextUsers = [...staffUsers, nextUser];
    updateUsers(nextUsers);

    setNewUserForm({
      name: "",
      email: "",
      role: "Staff",
    });
  };

  const updateStaffUser = (userId, fieldName, value) => {
    updateUsers(
      staffUsers.map((user) =>
        user.id === userId
          ? {
              ...user,
              [fieldName]: value,
            }
          : user
      )
    );
  };

  const toggleStaffUserActive = (userId) => {
    updateUsers(
      staffUsers.map((user) =>
        user.id === userId
          ? {
              ...user,
              active: !user.active,
            }
          : user
      )
    );
  };

  const deleteStaffUser = (userId) => {
    const confirmed = window.confirm(
      "Delete this staff user? Existing assignments typed with this name will stay on the bookings."
    );

    if (!confirmed) {
      return;
    }

    const nextUsers = staffUsers.filter((user) => user.id !== userId);

    updateUsers(nextUsers);

        if (currentStaffUserId === userId) {
      setCurrentStaffUserId("");
      saveCurrentStaffUserId("");
    }
  };

  return (
    <section className="admin-page">
      <article className="dashboard-card admin-hero-card">
        <div className="admin-hero-header">
          <div className="dashboard-heading-with-icon">
            <span className="section-icon">
              <FaUserShield />
            </span>

            <div>
              <p className="dashboard-eyebrow">Administration</p>
                            <h2>User Admin</h2>
              <span>
                The staff directory used for checklist, staff and facility
                assignments. It is separate from sign-in accounts: everyone
                shares one login, so "Working as" on each computer records
                who did something.
              </span>
            </div>
          </div>

                    <label className="admin-current-user-picker">
            <span>Working as (this computer)</span>

            <select
              value={currentStaffUserId}
              onChange={(event) => {
                setCurrentStaffUserId(event.target.value);
                saveCurrentStaffUserId(event.target.value);
              }}
            >
              <option value="">Choose your name…</option>
              {activeUsers.map((user) => (
                <option value={user.id} key={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {staffDirectoryStatus.checked && (
          <div
            className={`admin-directory-status ${
              staffDirectoryStatus.shared ? "is-shared" : "is-local"
            }`}
            role="status"
          >
            {staffDirectoryStatus.shared ? (
              <>
                <strong>Shared staff directory</strong>
                <span>
                  The same list on every computer. "Working as" is remembered
                  per computer and is what checklist "completed by" records.
                </span>
                {onCopyBrowserListToShared && (
                  <button
                    className="secondary-dashboard-button"
                    type="button"
                    onClick={onCopyBrowserListToShared}
                  >
                    Copy this browser's old list into it
                  </button>
                )}
              </>
            ) : (
              <>
                <strong>Using this browser's staff list</strong>
                <span>
                  {staffDirectoryStatus.reason} Changes here are saved only on
                  this computer until the staff directory migration is run.
                </span>
              </>
            )}
          </div>
        )}

        {unlistedStaffNames.length > 0 && (
          <div className="admin-unlisted-names">
            <strong>Names on bookings that are not in the directory</strong>
            <span>
              They were typed on checklist items or staff assignments. Add the
              ones that are real staff members; nothing is added or matched
              automatically.
            </span>
            <ul>
              {unlistedStaffNames.map((name) => (
                <li key={name}>
                  {name}
                  <button
                    className="secondary-dashboard-button"
                    type="button"
                    onClick={() => addUnlistedName(name)}
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="admin-summary-grid">
          <div>
            <small>Active Users</small>
            <strong>{activeUsers.length}</strong>
          </div>

          <div>
            <small>Inactive Users</small>
            <strong>{inactiveUsers.length}</strong>
          </div>

          <div>
            <small>Total Users</small>
            <strong>{staffUsers.length}</strong>
          </div>
        </div>
      </article>

      <article className="dashboard-card admin-panel-card">
        <div className="admin-panel-header">
          <div>
            <p className="dashboard-eyebrow">Create User</p>
            <h3>Add Staff Member</h3>
            <span>
              Add people who can be assigned to booking checklists and meals/activities work.
            </span>
          </div>
        </div>

        <form className="admin-user-form" onSubmit={handleAddUser}>
          <label>
            <span>Name</span>
            <input
              value={newUserForm.name}
              placeholder="Example: Mindy"
              onChange={(event) => updateNewUserField("name", event.target.value)}
            />
          </label>

          <label>
            <span>Email</span>
            <input
              type="email"
              value={newUserForm.email}
              placeholder="name@toahnipi.org"
              onChange={(event) => updateNewUserField("email", event.target.value)}
            />
          </label>

          <label>
            <span>Role</span>
            <select
              value={newUserForm.role}
              onChange={(event) => updateNewUserField("role", event.target.value)}
            >
              <option value="Admin">Admin</option>
              <option value="Staff">Staff</option>
              <option value="Viewer">Viewer</option>
            </select>
          </label>

          <button className="primary-dashboard-button" type="submit">
            <FaPlus />
            Add User
          </button>
        </form>
      </article>

      <article className="dashboard-card admin-panel-card">
        <div className="admin-panel-header">
          <div>
            <p className="dashboard-eyebrow">Staff Directory</p>
            <h3>Users</h3>
            <span>
              These names are matched against assignment names on booking tasks.
            </span>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Current User</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>

            <tbody>
              {staffUsers.map((user) => (
                <tr className={!user.active ? "admin-user-inactive" : ""} key={user.id}>
                  <td>
                    <input
                      value={user.name}
                      onChange={(event) =>
                        updateStaffUser(user.id, "name", event.target.value)
                      }
                    />
                  </td>

                  <td>
                    <input
                      type="email"
                      value={user.email}
                      onChange={(event) =>
                        updateStaffUser(user.id, "email", event.target.value)
                      }
                    />
                  </td>

                  <td>
                    <select
                      value={user.role}
                      onChange={(event) =>
                        updateStaffUser(user.id, "role", event.target.value)
                      }
                    >
                      <option value="Admin">Admin</option>
                      <option value="Staff">Staff</option>
                      <option value="Viewer">Viewer</option>
                    </select>
                  </td>

                  <td>
                    <button
                      className={`admin-status-pill ${user.active ? "active" : "inactive"}`}
                      type="button"
                      onClick={() => toggleStaffUserActive(user.id)}
                    >
                      {user.active ? "Active" : "Inactive"}
                    </button>
                  </td>

                  <td>
                    {currentStaffUserId === user.id ? (
                      <span className="admin-current-pill">Current</span>
                    ) : (
                      <button
                        className="secondary-dashboard-button"
                        type="button"
                        onClick={() => {
                          setCurrentStaffUserId(user.id);
                          saveCurrentStaffUserId(user.id);
                        }}
                      >
                        Use Me
                      </button>
                    )}
                  </td>

                  <td>
                    <button
                      className="booking-checklist-delete-button"
                      type="button"
                      onClick={() => deleteStaffUser(user.id)}
                      aria-label={`Delete ${user.name}`}
                    >
                      <FaTrashAlt />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {isAdmin && <StaffAccessPanel />}
    </section>
  );
}
