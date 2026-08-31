import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

// Key written to localStorage purely as a cross-tab signal. Every tab listens
// for storage events on this key; when one tab logs out, every other tab
// sees the change and clears its own in-memory state immediately, even
// though localStorage itself is shared (storage events only fire in OTHER
// tabs, not the one that made the change, so each tab needs this listener
// to catch logouts that happened elsewhere).
const LOGOUT_BROADCAST_KEY = 'cp_logout_broadcast';

function clearAuthStorage() {
  localStorage.removeItem('cp_access_token');
  localStorage.removeItem('cp_refresh_token');
  localStorage.removeItem('cp_user');
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('cp_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [sessionExpired, setSessionExpired] = useState(false);

  const login = useCallback(async (identifier, password, role) => {
    const res = await api.post('/auth/login', { email: identifier, password, role });
    localStorage.setItem('cp_access_token', res.data.accessToken);
    localStorage.setItem('cp_refresh_token', res.data.refreshToken);
    localStorage.setItem('cp_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  }, []);

  // Clears everything SYNCHRONOUSLY first - storage, in-memory state, and
  // the cross-tab broadcast - before attempting the (best-effort, fire-and-
  // forget) server-side token revocation. This is the fix for the real bug:
  // previously the API call was awaited first and storage was cleared after,
  // so a caller that didn't await logout() could navigate away while the
  // old session was still fully intact in localStorage, and on landing back
  // on a protected route the app would silently re-authenticate from the
  // stale stored user. Clearing client state first removes that window
  // entirely - even if the network call never completes, the user is
  // already logged out everywhere that matters on this device.
  const logout = useCallback(async (reason) => {
    const refreshTokenForRevocation = localStorage.getItem('cp_refresh_token');

    clearAuthStorage();
    setUser(null);
    // Bump a counter so every tab's storage listener fires, even if this
    // exact value was used before.
    localStorage.setItem(LOGOUT_BROADCAST_KEY, String(Date.now()));
    if (reason === 'expired') setSessionExpired(true);

    try {
      // Best-effort server-side revocation using the token captured above,
      // before it was cleared. Client-side logout is already complete
      // regardless of whether this call succeeds.
      if (refreshTokenForRevocation) {
        await api.post('/auth/logout', { refreshToken: refreshTokenForRevocation });
      }
    } catch (e) {
      // Non-fatal - client-side logout already happened above.
    }
  }, []);

  // Cross-tab logout: when ANY tab clears auth (including this one writing
  // the broadcast key), every OTHER open tab's listener fires and clears
  // its own state too, so a user can't stay logged into a stale tab after
  // logging out elsewhere.
  useEffect(() => {
    function handleStorageChange(e) {
      if (e.key === LOGOUT_BROADCAST_KEY) {
        setUser(null);
      }
      // Defends against a tab being open during a logout that happened
      // purely via direct localStorage manipulation/devtools/another flow.
      if (e.key === 'cp_user' && e.newValue === null) {
        setUser(null);
      }
    }
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, sessionExpired, setSessionExpired }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
