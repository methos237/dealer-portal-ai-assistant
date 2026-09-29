import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import { cookies } from "next/headers";
import { SerwistProvider } from "@serwist/turbopack/react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  applicationName: "Dealer Portal",
  title: { default: "Dealer Portal", template: "%s · Dealer Portal" },
  description: "Dealer portal with an embedded AI assistant",
  appleWebApp: { capable: true, title: "Dealer Portal" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4f3" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1918" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ThemeToggle writes the cookie; rendering it here means no flash and no client script.
  const theme = (await cookies()).get("theme")?.value;
  return (
    <html
      lang="en"
      className={`${inter.variable} ${poppins.variable}`}
      data-theme={theme === "dark" || theme === "light" ? theme : undefined}
    >
      <body className="min-h-screen bg-bg text-fg">
        <SerwistProvider swUrl="/serwist/sw.js" reloadOnOnline={false}>
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}
