import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Expire", description: "Rescues expiring money, in the best order, and does it." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
