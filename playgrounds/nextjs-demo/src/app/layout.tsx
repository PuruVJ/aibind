import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "aibind Next.js Demo",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav
          style={{
            display: "flex",
            gap: "1rem",
            padding: "1rem",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <Link href="/">Home</Link>
          <Link href="/stream">Stream</Link>
          <Link href="/structured">Structured</Link>
        </nav>
        <main style={{ padding: "1rem", maxWidth: "48rem", margin: "0 auto" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
