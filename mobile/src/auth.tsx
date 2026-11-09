import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, get, loadToken, saveToken, setUnauthorizedHandler } from './api';

export interface Me { id: string; email: string; role: 'ATHLETE' | 'COACH' | 'ADMIN'; athlete?: any; coach?: any }
interface Ctx { me: Me | null; ready: boolean; signIn(email: string, password: string): Promise<void>; signUp(d: { email: string; password: string; role: 'ATHLETE' | 'COACH'; username?: string }): Promise<void>; signOut(): Promise<void>; refresh(): Promise<void> }
const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  const refresh = useCallback(async () => { setMe(await get<Me>('/me')); }, []);
  const signOut = useCallback(async () => { await saveToken(null); setMe(null); qc.clear(); }, [qc]);

  useEffect(() => {
    setUnauthorizedHandler(() => { signOut(); });
    (async () => { try { if (await loadToken()) await refresh(); } catch { await saveToken(null); } finally { setReady(true); } })();
  }, [refresh, signOut]);

  const finish = async (r: { token: string }) => { await saveToken(r.token); await refresh(); };
  const value: Ctx = {
    me, ready, refresh, signOut,
    signIn: async (email, password) => finish(await api('POST', '/auth/login', { email, password })),
    signUp: async (d) => finish(await api('POST', '/auth/register', d)),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
