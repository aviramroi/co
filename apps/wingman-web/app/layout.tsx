import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces/index.css";
import "@fontsource-variable/fraunces/standard-italic.css";
import "./globals.css";
import "./premium.css";

export const metadata: Metadata = {
  title: "Wingman — the AI that runs your conversations",
  description:
    "Wingman is the autonomous AI agent that runs your dating and Facebook Marketplace conversations for you — in your voice, with human-like timing, fully automated.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
