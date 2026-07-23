import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Captcha, { captchaEnabled } from '../components/Captcha';

export default function Login() {
  const { login, verifyMfa } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [captchaToken, setCaptchaToken] = useState(null);
  const [mfa, setMfa] = useState(null); // { mfaToken }
  const [otp, setOtp] = useState('');
  const [error, setError] = useState(null);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const captchaMissing = captchaEnabled && !captchaToken;

  const submitPassword = async (e) => {
    e.preventDefault();
    setError(null);
    if (captchaMissing) {
      setError('Please complete the CAPTCHA.');
      return;
    }
    try {
      const res = await login(form.email, form.password, captchaToken);
      if (res.mfaRequired) setMfa({ mfaToken: res.mfaToken });
      else navigate('/');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Login failed');
    }
  };

  const submitOtp = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await verifyMfa(mfa.mfaToken, otp);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Invalid code');
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-lg bg-white p-6 shadow">
      <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {!mfa ? (
        <form onSubmit={submitPassword} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500" htmlFor="login-email">Email</label>
            <input id="login-email" name="email" type="email" value={form.email} onChange={onChange}
              placeholder="Email" className="w-full rounded border px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm text-gray-500" htmlFor="login-password">Password</label>
            <input id="login-password" name="password" type="password" value={form.password} onChange={onChange}
              placeholder="Password" className="w-full rounded border px-3 py-2" required />
          </div>
          <Captcha onToken={setCaptchaToken} />
          <button type="submit" disabled={captchaMissing}
            className="w-full rounded bg-indigo-600 py-2 text-white disabled:opacity-50">Continue</button>
        </form>
      ) : (
        <form onSubmit={submitOtp} className="space-y-4">
          <p className="text-sm text-gray-600">
            Enter the 6-digit code from your authenticator app (or a recovery code).
          </p>
          <div>
            <label className="block text-sm text-gray-500" htmlFor="login-otp">
              Authenticator or recovery code
            </label>
            <input id="login-otp" value={otp} onChange={(e) => setOtp(e.target.value)}
              placeholder="123456" className="w-full rounded border px-3 py-2 tracking-widest" required />
          </div>
          <button type="submit" className="w-full rounded bg-indigo-600 py-2 text-white">Verify</button>
        </form>
      )}
    </div>
  );
}
