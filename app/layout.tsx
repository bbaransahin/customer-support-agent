import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local Customer Support Agent",
  description: "Catalog search and grounded support chat for the Flipkart sample dataset.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <div className="brand">
              <h1>Local Customer Support Agent</h1>
              <p>Catalog search and grounded support answers from the local CSV index.</p>
            </div>
            <nav className="nav">
              <Link href="/">Overview</Link>
              <Link href="/products">Products</Link>
              <Link href="/chat">Chat</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
