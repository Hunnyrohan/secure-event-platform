import { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

function MfaSection({ user, setUser }) {
  const [setup, setSetup] = useState(null); // { qrDataUrl, manualKey }
  const [token, setToken] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const startSetup = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await client.post('/users/me/mfa/setup');
      setSetup(res.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not start MFA setup');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await client.post('/users/me/mfa/enable', { token });
      setRecoveryCodes(res.data.recoveryCodes);
      setSetup(null);
      setToken('');
      setUser({ ...user, mfaEnabled: true });
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setError(null);
    setBusy(true);
    try {
      await client.post('/users/me/mfa/disable');
      setUser({ ...user, mfaEnabled: false });
      setRecoveryCodes(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not disable MFA');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 border-t pt-4">
      <h3 className="font-medium">Two-factor authentication (TOTP)</h3>
      {error && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {/* Already enabled */}
      {user.mfaEnabled && !recoveryCodes && (
        <div className="mt-2">
          <p className="text-sm text-green-700">✓ Enabled — codes come from your authenticator app.</p>
          <button type="button" onClick={disable} disabled={busy}
            className="mt-2 rounded border px-3 py-1 text-sm text-red-600">Disable MFA</button>
        </div>
      )}

      {/* Freshly enabled: show recovery codes once */}
      {recoveryCodes && (
        <div className="mt-2 rounded bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">
            Save these recovery codes now — they are shown only once. Each works once if you lose your device.
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">
            {recoveryCodes.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}

      {/* Not enabled, not yet setting up */}
      {!user.mfaEnabled && !setup && !recoveryCodes && (
        <button type="button" onClick={startSetup} disabled={busy}
          className="mt-2 rounded border px-3 py-1 text-sm">Enable MFA</button>
      )}

      {/* Setup in progress: show QR + confirm */}
      {setup && (
        <form onSubmit={confirmEnable} className="mt-2 space-y-2">
          <p className="text-sm text-gray-600">
            Scan this QR code in Google Authenticator / Authy, then enter the 6-digit code to confirm.
          </p>
          <img src={setup.qrDataUrl} alt="MFA QR code" className="h-40 w-40 border" />
          <p className="text-xs text-gray-500">
            Can&apos;t scan? Enter this key manually: <span className="font-mono">{setup.manualKey}</span>
          </p>
          <input value={token} onChange={(e) => setToken(e.target.value)} inputMode="numeric"
            placeholder="123456" className="w-40 rounded border px-3 py-2 tracking-widest" required />
          <div>
            <button type="submit" disabled={busy}
              className="rounded bg-indigo-600 px-3 py-1 text-sm text-white">Confirm &amp; enable</button>
          </div>
        </form>
      )}
    </div>
  );
}

function ProfileEditor({ user, setUser }) {
  const [fullName, setFullName] = useState(user.fullName || '');
  const [bio, setBio] = useState(user.bio || '');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      // Server sanitizes name/bio (sanitize-html) before storing; it returns the
      // stored (safe) values, which we reflect back into state.
      const res = await client.patch('/users/me', { fullName, bio });
      setUser({ ...user, fullName: res.data.user.fullName, bio: res.data.user.bio });
      setFullName(res.data.user.fullName || '');
      setBio(res.data.user.bio || '');
      setMsg('Profile saved.');
    } catch {
      setMsg('Could not save profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="mt-4 space-y-2 border-t pt-4">
      <h3 className="font-medium">Edit profile</h3>
      {msg && <p className="text-sm text-gray-600">{msg}</p>}
      <label className="block text-sm text-gray-500" htmlFor="pf-name">Full name</label>
      <input id="pf-name" value={fullName} onChange={(e) => setFullName(e.target.value)}
        className="w-full rounded border px-3 py-2" minLength={2} maxLength={120} />
      <label className="block text-sm text-gray-500" htmlFor="pf-bio">Bio</label>
      <textarea id="pf-bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
        maxLength={2000} className="w-full rounded border px-3 py-2"
        placeholder="Tell others about yourself…" />
      <button type="submit" disabled={busy}
        className="rounded bg-indigo-600 px-3 py-1 text-sm text-white">Save profile</button>
    </form>
  );
}

export default function Profile() {
  const { user, setUser } = useAuth();
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    client.get('/users/me/bookings').then((r) => setBookings(r.data.bookings)).catch(() => {});
  }, []);

  const exportData = async () => {
    const res = await client.get('/users/me/export');
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'my-data.json'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">My profile</h1>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <p><span className="text-gray-500">Name:</span> {user.fullName}</p>
        <p><span className="text-gray-500">Username:</span> {user.username}</p>
        <p><span className="text-gray-500">Email:</span> {user.email}</p>
        <p><span className="text-gray-500">Role:</span> {user.role}</p>
        {user.bio && (
          // Rendered as auto-escaped text; content was also sanitized server-side.
          <p className="mt-1"><span className="text-gray-500">Bio:</span> {user.bio}</p>
        )}
        <div className="mt-3">
          <button type="button" onClick={exportData} className="rounded border px-3 py-1 text-sm">
            Export my data
          </button>
        </div>
        <ProfileEditor user={user} setUser={setUser} />
        <MfaSection user={user} setUser={setUser} />
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Booking history</h2>
        {bookings.length === 0 && <p className="text-gray-500">No bookings yet.</p>}
        <ul className="space-y-2">
          {bookings.map((b) => (
            <li key={b.id} className="rounded border bg-white p-3 text-sm">
              {b.title} — {b.status} — {new Date(b.starts_at).toLocaleString()}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
