import type { Metadata } from "next";
import "./globals.css";
import "./twin.css";

export const metadata: Metadata = {
  title: "Census Twin — predict the city",
  description: "Synthetic population polling from census microdata — ask any question and see how residents would respond.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
