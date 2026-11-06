import type { AuthUser, LoginBody, LoginResponse } from '@shikshya/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from '@/lib/api';

interface AuthState {
  user: AuthUser | null;
  /** True until we know whether the refresh cookie gives us a session. */
  loading: boolean;
  login: (body: LoginBody) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Replaces the session, for example after changing a password. */
  adoptSession: (session: LoginResponse) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const adoptSession = useCallback((session: LoginResponse) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    // Nothing fetched as one user may be shown to the next person on this device.
    queryClient.clear();
  }, [queryClient]);

  // Silent refresh: a reload loses the in-memory token, so ask for a new one.
  useEffect(() => {
    setSessionExpiredHandler(clearSession);
    refreshSession()
      .then((session) => setUser(session.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [clearSession]);

  const login = useCallback(
    async (body: LoginBody) => {
      const session = await api.post<LoginResponse>('/auth/login', body, { skipRefresh: true });
      queryClient.clear();
      adoptSession(session);
      return session.user;
    },
    [adoptSession, queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', undefined, { skipRefresh: true });
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({ user, loading, login, logout, adoptSession }),
    [user, loading, login, logout, adoptSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

/** For pages behind ProtectedRoute, where a user always exists. */
export function useCurrentUser() {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser must be used on a protected page');
  return user;
}
