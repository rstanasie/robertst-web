import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  // Lets every page give Open Graph images and canonicals as paths and have
  // Next resolve them against the real origin.
  metadataBase: new URL(siteUrl()),
  title: "Robert-Stefan Tanasie",
  description: "Personal website for writings and interactive experiences.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header>
          <nav>
            <Link href="/">Home</Link>
            {" | "}
            <Link href="/about">About</Link>
          </nav>
        </header>

        {children}
      </body>
    </html>
  );
}