import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import LayoutChrome from "@/components/LayoutChrome";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Defunds",
  description: "Let professional investors manage your money",
  icons: {
    icon: [
      { url: "/favicon.ico?v=2" },
      { url: "/favicon-32.png?v=2", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png?v=2", sizes: "16x16", type: "image/png" }
    ],
    shortcut: ["/favicon.ico?v=2"],
    apple: [{ url: "/apple-touch-icon.png?v=2", sizes: "180x180" }]
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          <LayoutChrome>
            {children}
          </LayoutChrome>
        </Providers>
      </body>
    </html>
  );
}
