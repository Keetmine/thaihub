import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "ThaiHub",
  description: "Расписание концертов и событий",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      data-bs-theme="dark"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-100`}
    >
      <body className="d-flex flex-column min-vh-100">{children}</body>
    </html>
  );
}
