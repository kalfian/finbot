"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDarkMode(document.documentElement.dataset.theme === "dark");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggle() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    try { window.localStorage.setItem("ledger-theme", next ? "dark" : "light"); } catch {}
  }

  return <button className="theme-button" type="button" onClick={toggle} aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} title={darkMode ? "Light mode" : "Dark mode"}>{darkMode ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}</button>;
}
