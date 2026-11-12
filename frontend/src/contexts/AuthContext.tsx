import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { User, LoginCredentials, AuthResponse } from "../types";
import { apiService } from "../services/api";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const savedUser = localStorage.getItem("user");

      if (token && savedUser) {
        // Validate token by fetching profile
        try {
          const currentUser = await apiService.getProfile();
          setUser(currentUser);
        } catch {
          // Token invalid, clear storage
          localStorage.removeItem("auth_token");
          localStorage.removeItem("refresh_token");
          localStorage.removeItem("user");
          setUser(null);
        }
      }
    } catch (error) {
      console.error("Error initializing auth:", error);
      localStorage.removeItem("auth_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user");
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials: LoginCredentials): Promise<void> => {
    try {
      setLoading(true);
      const authResponse: AuthResponse = await apiService.login(credentials);
      setUser(authResponse.user);

      // Store user data
      localStorage.setItem("user", JSON.stringify(authResponse.user));
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await apiService.logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
      localStorage.removeItem("auth_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user");
    }
  };

  const refreshUser = async (): Promise<void> => {
    try {
      const currentUser = await apiService.getProfile();
      setUser(currentUser);
      localStorage.setItem("user", JSON.stringify(currentUser));
    } catch (error) {
      console.error("Error refreshing user:", error);
      setUser(null);
    }
  };

  const isAuthenticated = !!user;

  const hasRole = (role: string): boolean => {
    if (!user) return false;

    return user.role === "admin" || user.role === role;
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    logout,
    refreshUser,
    isAuthenticated,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
