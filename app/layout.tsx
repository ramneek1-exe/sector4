import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Sector 4", description: "F1 weekend companion" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
