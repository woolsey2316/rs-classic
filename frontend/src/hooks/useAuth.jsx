import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchMe, login as apiLogin, register as apiRegister } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("rsc_access"));
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);

  const persistTokens = useCallback((access, refresh) => {
    localStorage.setItem("rsc_access", access);
    if (refresh) {
      localStorage.setItem("rsc_refresh", refresh);
    }
    setToken(access);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("rsc_access");
    localStorage.removeItem("rsc_refresh");
    setToken(null);
    setPlayer(null);
  }, []);

  const refreshPlayer = useCallback(async () => {
    const me = await fetchMe();
    setPlayer(me);
    return me;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = await fetchMe();
        if (!cancelled) {
          setPlayer(me);
        }
      } catch {
        if (!cancelled) {
          logout();
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  const login = useCallback(
    async (username, password) => {
      const data = await apiLogin(username, password);
      persistTokens(data.access, data.refresh);
      const me = await fetchMe();
      setPlayer(me);
      return me;
    },
    [persistTokens],
  );

  const register = useCallback(
    async (username, password, displayName) => {
      const data = await apiRegister(username, password, displayName);
      persistTokens(data.access, data.refresh);
      setPlayer(data.player);
      return data.player;
    },
    [persistTokens],
  );

  const value = useMemo(
    () => ({
      token,
      player,
      setPlayer,
      loading,
      login,
      register,
      logout,
      refreshPlayer,
    }),
    [token, player, loading, login, register, logout, refreshPlayer],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
