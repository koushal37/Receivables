import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

// { session, user, role, business, refresh, signOut, can(action) }
export function useAuth() {
  return useContext(AuthContext);
}
