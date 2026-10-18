"use client";
import { createContext, useContext } from "react";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
export const PreferencesContext = createContext({
  timezone: DEFAULT_TIMEZONE,
  openSettings: () => {},
});
export const usePreferences = () => useContext(PreferencesContext);
