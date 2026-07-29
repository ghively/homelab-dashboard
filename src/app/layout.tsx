import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Homelab Dashboard",
  description: "Single pane of glass for the homelab fleet — OpenUI + Cyber Noir v4",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
