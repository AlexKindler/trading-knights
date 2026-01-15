import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { User } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string, grade?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Login failed");
    setUser(data.user);
    queryClient.invalidateQueries();
  };

  const register = async (email: string, password: string, displayName: string, grade?: string) => {
    const res = await apiRequest("POST", "/api/auth/register", { email, password, displayName, grade });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Registration failed");
    setUser(data.user);
  };

  const logout = async () => {
    await apiRequest("POST", "/api/auth/logout", {});
    setUser(null);
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
