import type { Metadata } from "next";
import { Geist, Geist_Mono, Pixelify_Sans } from "next/font/google";
import "./globals.css";
import "./twin.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pixelify = Pixelify_Sans({
  variable: "--font-pixelify",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Delhi Census Twin — predict the city",
  description: "Census 2011 synthetic population polling for NCT Delhi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${pixelify.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
