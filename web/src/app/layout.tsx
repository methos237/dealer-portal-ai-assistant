import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import Script from "next/script";
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

/* CSS light-dark() follows the OS on its own; this only re-applies a saved override early. */
const themeScript = `try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${poppins.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-bg text-fg">
        <Script id="theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <SerwistProvider swUrl="/serwist/sw.js" reloadOnOnline={false}>
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}
