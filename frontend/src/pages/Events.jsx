import { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Events() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    client.get('/events').then((res) => setEvents(res.data.events)).catch(() => {});
  }, []);

  const book = async (id) => {
    setMsg(null);
    try {
      await client.post(`/bookings/events/${id}`);
      setMsg('Booked! Check your booking history in your profile.');
    } catch (err) {
      setMsg(err.response?.data?.error?.message || 'Could not book');
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Upcoming events</h1>
      {msg && <p className="rounded bg-indigo-50 p-2 text-sm text-indigo-800">{msg}</p>}
      {events.length === 0 && <p className="text-gray-500">No events yet.</p>}
      {events.map((ev) => (
        // {ev.title} / {ev.description} are rendered as TEXT by React -> XSS-safe.
        <div key={ev.id} className="rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="font-semibold">{ev.title}</h2>
          <p className="text-sm text-gray-600">{ev.description}</p>
          <p className="mt-1 text-xs text-gray-500">
            {ev.location} · {new Date(ev.startsAt).toLocaleString()} · {ev.seatsAvailable} seats left
            {ev.ticketPrice > 0 ? ` · $${ev.ticketPrice}` : ' · Free'}
          </p>
          {user && (
            <button type="button" onClick={() => book(ev.id)}
              disabled={ev.seatsAvailable <= 0}
              className="mt-2 rounded bg-indigo-600 px-3 py-1 text-sm text-white disabled:bg-gray-300">
              {ev.seatsAvailable > 0 ? 'Book' : 'Full'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
