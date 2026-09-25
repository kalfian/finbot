import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Ledger", description: "A calm place to keep track of everyday expenses." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
