import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wingman — your AI agent for dating & marketplace",
  description:
    "One AI agent that manages your Tinder conversations, Facebook Marketplace deals, and group outreach — humanlike, on your terms, with you in the loop.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
