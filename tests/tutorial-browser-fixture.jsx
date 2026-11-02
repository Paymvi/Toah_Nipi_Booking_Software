// Local browser fixture only. It is not imported by the app or included in its build.
// All database/auth requests are mocked before the application module is loaded.
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
window.tutorialRequests = [];
window.fixtureAlerts = [];
window.alert = (message) => window.fixtureAlerts.push(message);
window.confirm = () => false;
const booking = {
  id: 'tutorial-fixture', organization_name: 'Pine Trail Fixture', contact_name: 'Alex Example',
  email: 'example@example.invalid', phone: '', start_date: '2026-11-10', end_date: '2026-11-12',
  total_guests: 24, status: 'Confirmed', source_type: 'Staff Booking', retreat_type: 'Other',
  updated_at: '2026-10-31T12:00:00Z', created_at: '2026-10-31T12:00:00Z', rental_form_details: {},
};
window.fetch = async (input, options = {}) => {
  const url = String(typeof input === 'string' ? input : input.url || input);
  const method = options.method || 'GET';
  window.tutorialRequests.push({ url: new URL(url, location.href).pathname, method });
  if (method !== 'GET' && !url.includes('/rpc/current_staff_role')) throw new Error('Fixture refuses database mutations');
  const body = url.includes('/rpc/current_staff_role') ? 'admin' : url.includes('/bookings') ? (location.search.includes('empty') || Number(new URL(url).searchParams.get('offset') || 0) > 0 ? [] : [booking]) : [];
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' } });
};
const { default: App } = await import('../src/App.jsx');
const { default: Dashboard } = await import('../src/pages/Dashboard.jsx');
createRoot(document.getElementById('root')).render(location.search.includes('login') ? <App /> : <BrowserRouter><Dashboard /></BrowserRouter>);
