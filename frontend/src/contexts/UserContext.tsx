"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type UserProfile = {
  identifier: string;
  name: string;
  email: string;
  role: string;
};

type UserContextValue = {
  userId: string;
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => void;
};

const STORAGE_KEY = "mockmate.user";

const defaultProfile: UserProfile = {
  identifier: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `user-${Date.now()}`,
  name: "",
  email: "",
  role: "",
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as UserProfile;
        if (parsed && parsed.identifier) {
          setProfile(parsed);
          return;
        }
      } catch (error) {
        console.warn("Unable to parse stored user profile", error);
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultProfile));
  }, []);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...updates };
      if (!next.identifier.trim()) {
        next.identifier = prev.identifier;
      }
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      userId: profile.identifier,
      profile,
      updateProfile,
    }),
    [profile, updateProfile],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
