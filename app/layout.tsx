import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Inter } from "next/font/google";
import "./globals.css";

const display = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  metadataBase: new URL("https://nba-pinpoint.vercel.app"),
  title: "NBA Pinpoint",
  description:
    "Name the top 100 players in a random NBA stat category. Three lives, deep-cut points, and one last-chance lifeline.",
  openGraph: {
    title: "NBA Pinpoint",
    description: "Can you name the top 100? A stat-leaderboard guessing game with 1,000+ NBA categories.",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "NBA Pinpoint" },
};

export const viewport: Viewport = { themeColor: "#0b0f1a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
