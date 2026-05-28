import React, { createContext, useContext, useState, ReactNode } from 'react';
import api from '../utils/api';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  isSupervisor: boolean;
  canApprove: boolean;
  isCarrier: boolean;
  isInternal: boolean;
}

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));

  const login = async (username: string, password: string) => {
    const { data } = await api.post('/auth/login', { username, password });
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const role = user?.role;
  const isAdmin      = role === 'admin';
  const isSupervisor = role === 'supervisor' || role === 'admin';
  const canApprove   = role === 'admin' || role === 'supervisor';
  const isCarrier    = role === 'carrier';
  const isInternal   = role !== 'carrier';

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAdmin, isSupervisor, canApprove, isCarrier, isInternal }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
