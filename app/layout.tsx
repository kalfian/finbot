import type { Metadata } from "next";
import "./legacy-surface.css";
import "./globals.css";
import "./refinement.css";
import "./tags.css";
import { EXPENSE_RECORDER_DESIGN_CSS } from "@/lib/expense-recorder-design";

export const metadata: Metadata = {
  title: "Ledger",
  description: "A calm place to keep track of everyday expenses.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const themeScript =
    "try { const saved = localStorage.getItem('ledger-theme') || localStorage.getItem('expense-tracker-theme'); const theme = saved === 'light' || saved === 'dark' ? saved : matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; } catch {}";
  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <style
          dangerouslySetInnerHTML={{ __html: EXPENSE_RECORDER_DESIGN_CSS }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
