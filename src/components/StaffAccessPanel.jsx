/*
  User Admin → Sign-in access. Admins give individual Supabase Auth
  accounts a role (and the kitchen department for limited staff). The
  database function staff_app_admin_set_access checks that the caller is an
  admin; this panel only collects the choice.
*/
import { useEffect, useState } from "react";
import { FaKey } from "react-icons/fa";

import { fetchStaffAccessList, setStaffAccess } from "../services/staffAppService";
import { formatWhen } from "../utils/staffAppFormat";
import { getLocalDate } from "../utils/portalEmail";

const ROLE_OPTIONS = [
  { value: "limited", label: "Limited staff: staff app only" },
  { value: "viewer", label: "Viewer: office app, read only" },
  { value: "staff", label: "Staff: office app, can edit" },
  { value: "admin", label: "Admin: everything" },
];
const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map((option) => [option.value, option.label.split(":")[0]]));
const EMPTY_FORM = { email: "", fullName: "", role: "limited", kitchen: true, isActive: true };

export default function StaffAccessPanel() {
  const [list, setList] = useState({ rows: [], error: null, loaded: false });
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState({ tone: "", text: "" });
  const [isSaving, setIsSaving] = useState(false);
  const today = getLocalDate(new Date());

  useEffect(() => {
    let current = true;
    fetchStaffAccessList()
      .then((rows) => current && setList({ rows: rows || [], error: null, loaded: true }))
      .catch((error) => current && setList({ rows: [], error, loaded: true }));
    return () => {
      current = false;
    };
  }, [reloadKey]);

  const edit = (row) => {
    setForm({
      email: row.email,
      fullName: row.fullName || "",
      role: row.role || "limited",
      kitchen: (row.departments || []).includes("kitchen"),
      isActive: row.hasProfile ? row.isActive : true,
    });
    setMessage({ tone: "", text: "" });
  };

  const submit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage({ tone: "", text: "" });
    try {
      const saved = await setStaffAccess({
        email: form.email,
        fullName: form.fullName,
        role: form.role,
        departments: form.kitchen ? ["kitchen"] : [],
        isActive: form.isActive,
      });
      setMessage({ tone: "ok", text: `Saved: ${saved.email} is ${ROLE_LABELS[saved.role]}${saved.isActive ? "" : " (inactive)"}.` });
      setForm(EMPTY_FORM);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  if (list.error?.kind === "access") return null;

  return (
    <article className="dashboard-card staff-access-card">
      <div className="dashboard-heading-with-icon">
        <span className="section-icon"><FaKey /></span>
        <div>
          <p className="dashboard-eyebrow">Sign-in access</p>
          <h2>Individual accounts and the staff app</h2>
          <span>
            Each person needs their own sign-in. Create or invite them first in Supabase (Authentication → Users),
            then choose their access here. <strong>Limited staff</strong> only ever see the staff app (Today,
            Calendar and group details without contacts, payments or private notes); the kitchen department adds the
            kitchen view and dietary information. To remove access, untick Active and ban the Auth user.
          </span>
        </div>
      </div>

      {list.error ? (
        <p className="staff-access-message staff-access-message-error">{list.error.message}</p>
      ) : (
        <>
          <form className="staff-access-form" onSubmit={submit}>
            <label>
              <span>Sign-in email</span>
              <input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </label>
            <label>
              <span>Name</span>
              <input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Shown on change history" />
            </label>
            <label>
              <span>Access</span>
              <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="staff-access-check">
              <input type="checkbox" checked={form.role !== "limited" || form.kitchen} disabled={form.role !== "limited"} onChange={(event) => setForm({ ...form, kitchen: event.target.checked })} />
              <span>Kitchen{form.role !== "limited" ? " (office roles see everything)" : ""}</span>
            </label>
            <label className="staff-access-check">
              <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
              <span>Active</span>
            </label>
            <button className="primary-dashboard-button" type="submit" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save access"}
            </button>
          </form>
          {message.text && (
            <p className={`staff-access-message staff-access-message-${message.tone}`} role="status">{message.text}</p>
          )}

          <div className="staff-access-table-wrap">
            <table className="staff-access-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Access</th>
                  <th scope="col">Last sign-in</th>
                  <th scope="col"><span className="sa-visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {!list.loaded && <tr><td colSpan={5}>Loading…</td></tr>}
                {list.rows.map((row) => (
                  <tr key={row.userId}>
                    <td>{row.fullName || "—"}</td>
                    <td>{row.email}</td>
                    <td>
                      {row.hasProfile ? (
                        <>
                          {ROLE_LABELS[row.role] || row.role}
                          {row.role === "limited" && (row.departments || []).includes("kitchen") ? " · Kitchen" : ""}
                          {!row.isActive && " · Inactive"}
                        </>
                      ) : (
                        "No access"
                      )}
                      {row.isBanned && " · Banned"}
                    </td>
                    <td>{row.lastSignInAt ? formatWhen(row.lastSignInAt, today) : "Never"}</td>
                    <td>
                      <button className="secondary-dashboard-button" type="button" onClick={() => edit(row)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="staff-access-note">You cannot change your own access here; ask another administrator.</p>
        </>
      )}
    </article>
  );
}
