import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZAKTEK",
  description: "ZAKTEK Paint Protection Customer Portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
