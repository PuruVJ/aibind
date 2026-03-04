import { A } from "@solidjs/router";

export default function Nav() {
  return (
    <nav
      style={{
        display: "flex",
        gap: "1rem",
        padding: "1rem",
        "border-bottom": "1px solid #e5e7eb",
      }}
    >
      <A href="/">Home</A>
      <A href="/stream">Stream</A>
      <A href="/structured">Structured</A>
      <A href="/agent">Agent</A>
      <A href="/markdown">Markdown</A>
    </nav>
  );
}
