import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { apiClient } from '../api/client';
import { firstPage } from '../utils/constants';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  const logout = useCallback(async () => {
    if (session?.csrf) {
      try {
        await apiClient('logout', { data: {}, csrf: session.csrf });
      } catch (err) {
        console.error('Logout error:', err);
      }
    }
    setSession(null);
    location.hash = '';
  }, [session]);

  const login = useCallback(data => {
    location.hash = firstPage[data.user.role] || 'dashboard';
    setSession(data);
  }, []);

  useEffect(() => {
    apiClient('session')
      .then(data => setSession(data.user ? data : null))
      .catch(e => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user || null,
        csrf: session?.csrf || '',
        loaded,
        error,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
