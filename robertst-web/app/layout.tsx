import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
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