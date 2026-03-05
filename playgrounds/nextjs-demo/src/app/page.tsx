import Link from "next/link";

export default function Home() {
  return (
    <div>
      <h1>aibind Next.js Playground</h1>
      <p>Test the aibind library features:</p>
      <ul>
        <li>
          <Link href="/stream">Stream — streaming text</Link>
        </li>
        <li>
          <Link href="/structured">Structured — typed partial streaming</Link>
        </li>
      </ul>
    </div>
  );
}
