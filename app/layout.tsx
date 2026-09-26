import Link from "next/link";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cappy Hub",
  description: "Internal administration for the Coding Interview Club",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav>
          <Link href={"/"}>Dashboard</Link>
          <Link href={"/officers"}>Officers</Link>
          <Link href={"/events"}>Events</Link>
          <Link href={"/points"}>Points</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
