import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Expense Tracker", description: "Track everyday expenses and export reports." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `try{document.documentElement.dataset.theme=localStorage.getItem("expense-tracker-theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch{}` }} /></head><body>{children}</body></html>;
}
