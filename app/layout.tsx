import type { Metadata } from "next";
import { shareMetadata } from "@/lib/share-metadata";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  ...shareMetadata(),
  title: "北海道の距離感 | あなたの街なら、どこまで？",
  description: "北海道のライブ会場とホテルの距離を、なじみのある街を起点に地図で比較します。",
  icons: {
    icon: "/hokkaido-green.png",
    shortcut: "/hokkaido-green.png",
    apple: "/hokkaido-green.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
