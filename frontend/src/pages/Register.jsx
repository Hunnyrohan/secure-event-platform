import { useState } from 'react';
import client from '../api/client';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import Captcha, { captchaEnabled } from '../components/Captcha';

export default function Register() {
  const [form, setForm] = useState({
    fullName: '', username: '', email: '', password: '',
  });
  const [captchaToken, setCaptchaToken] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const captchaMissing = captchaEnabled && !captchaToken;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (captchaMissing) {
      setError('Please complete the CAPTCHA.');
      return;
    }
    try {
      await client.post('/auth/register', { ...form, captchaToken });
      setStatus('Check your email to verify your account.');
    } catch (err) {
      // Render server message as text (React escapes it) — no HTML injection.
      setError(err.response?.data?.error?.message || 'Registration failed');
    }
  };

  if (status) return <p className="rounded bg-green-50 p-4 text-green-800">{status}</p>;

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-4 rounded-lg bg-white p-6 shadow">
      <h1 className="text-xl font-semibold">Create your account</h1>
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <input name="fullName" value={form.fullName} onChange={onChange} placeholder="Full name"
        className="w-full rounded border px-3 py-2" required minLength={2} maxLength={120} />
      <input name="username" value={form.username} onChange={onChange} placeholder="Username"
        className="w-full rounded border px-3 py-2" required minLength={3} maxLength={30}
        pattern="[a-zA-Z0-9._-]+" title="Letters, digits, and . _ - only" />
      <input name="email" type="email" value={form.email} onChange={onChange} placeholder="Email"
        className="w-full rounded border px-3 py-2" required />
      <input name="password" type="password" value={form.password} onChange={onChange}
        placeholder="Password" className="w-full rounded border px-3 py-2" required minLength={12} />
      <PasswordStrengthMeter password={form.password} />
      <Captcha onToken={setCaptchaToken} />
      <button type="submit" disabled={captchaMissing}
        className="w-full rounded bg-indigo-600 py-2 text-white disabled:opacity-50">Sign up</button>
    </form>
  );
}
