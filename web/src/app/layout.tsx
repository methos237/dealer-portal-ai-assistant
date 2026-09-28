import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dealer Portal",
  description: "Dealer portal with an embedded AI assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
