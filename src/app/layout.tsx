import type { Metadata } from "next";
import "./globals.css";
import SpotlightRoot from "@/components/SpotlightRoot";

export const metadata: Metadata = {
  title: "HackDataV2 — Synthetic Data Platform",
  description: "Realistic, privacy-safe tabular, relational and document data — generated on demand.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SpotlightRoot />
        {children}
      </body>
    </html>
  );
}
