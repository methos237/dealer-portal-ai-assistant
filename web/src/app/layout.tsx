import type { Metadata, Viewport } from "next";
import { SerwistProvider } from "@serwist/turbopack/react";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Dealer Portal",
  title: { default: "Dealer Portal", template: "%s · Dealer Portal" },
  description: "Dealer portal with an embedded AI assistant",
  appleWebApp: { capable: true, title: "Dealer Portal" },
};

export const viewport: Viewport = { themeColor: "#1e3a5f" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <SerwistProvider swUrl="/serwist/sw.js" reloadOnOnline={false}>
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}
