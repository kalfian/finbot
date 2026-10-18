import type { Metadata } from "next";
import localFont from "next/font/local";

const ledgerFont = localFont({
  src: "../public/fonts/manrope-variable.ttf",
  variable: "--font-ledger",
  display: "swap",
});
const editorialFont = localFont({
  src: "../public/fonts/dm-serif-display.ttf",
  variable: "--font-editorial",
  weight: "400",
  display: "swap",
});
import "./globals.css";
import { EXPENSE_RECORDER_DESIGN_CSS } from "@/lib/expense-recorder-design";

export const metadata: Metadata = {
  title: "Ledger",
  description: "A calm place to keep track of everyday expenses.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const themeScript =
    "try { const saved = localStorage.getItem('ledger-theme'); const theme = saved === 'light' || saved === 'dark' ? saved : matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; } catch {}";
  return (
    <html
      lang="en"
      className={`${ledgerFont.variable} ${editorialFont.variable}`}
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
