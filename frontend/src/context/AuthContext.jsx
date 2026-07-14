import {
  createContext, useContext, useEffect, useMemo, useState,
} from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, ask the server who we are (relies on the HTTP-only cookie).
  useEffect(() => {
    client.get('/users/me')
      .then((res) => setUser(res.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    setUser,
    async login(email, password, captchaToken) {
      const res = await client.post('/auth/login', { email, password, captchaToken });
      if (res.data.mfaRequired) return { mfaRequired: true, mfaToken: res.data.mfaToken };
      setUser(res.data.user);
      return { mfaRequired: false };
    },
    async verifyMfa(mfaToken, otp) {
      const res = await client.post('/auth/mfa/verify', { mfaToken, otp });
      setUser(res.data.user);
    },
    async logout() {
      await client.post('/auth/logout');
      setUser(null);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
