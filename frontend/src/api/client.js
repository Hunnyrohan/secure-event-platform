import axios from 'axios';

/**
 * Axios instance for the API.
 *  - withCredentials: send/receive the HTTP-only auth cookies.
 *  - Request interceptor attaches the CSRF token (double-submit cookie).
 *  - Response interceptor transparently refreshes an expired access token
 *    once, then retries the original request.
 */
const client = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Fetch a CSRF token once and cache it; the backend also sets XSRF-TOKEN cookie.
let csrfReady = null;
async function ensureCsrf() {
  if (!csrfReady) {
    csrfReady = client.get('/csrf-token').catch(() => null);
  }
  return csrfReady;
}

client.interceptors.request.use(async (config) => {
  const method = (config.method || 'get').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    await ensureCsrf();
    const token = readCookie('XSRF-TOKEN');
    if (token) config.headers['X-CSRF-Token'] = token;
  }
  return config;
});

let refreshing = null;
client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    // The `/users/me` bootstrap probe is allowed to 401 for anonymous visitors
    // (public pages like Home/Events); AuthContext treats that as "logged out".
    // `/auth/*` calls manage their own 401s. Neither should trigger a redirect.
    const isAuthProbe = original.url.includes('/auth/') || original.url.includes('/users/me');
    if (error.response?.status === 401 && !original._retry && !isAuthProbe) {
      original._retry = true;
      try {
        refreshing = refreshing || client.post('/auth/refresh');
        await refreshing;
        refreshing = null;
        return client(original);
      } catch (e) {
        refreshing = null;
        // Refresh failed => the session is genuinely gone. Send the user to
        // the login page, but never when they're already there: doing so would
        // reload /login, which re-runs the auth bootstrap and loops forever,
        // flooding the API. On /login we just let the 401 propagate.
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

export default client;
