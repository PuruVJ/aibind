"use client";

import { useState } from "react";
import { useStream } from "@aibind/nextjs";

export default function StreamPage() {
  const [prompt, setPrompt] = useState("");
  const stream = useStream({
    system: "You are a helpful assistant. Keep responses concise.",
    model: "gpt",
  });

  return (
    <div>
      <h1>Stream Demo</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          stream.send(prompt);
          setPrompt("");
        }}
        style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}
      >
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask something..."
          style={{ flex: 1, padding: "0.5rem" }}
        />
        <button type="submit" disabled={stream.loading}>
          {stream.loading ? "Streaming..." : "Send"}
        </button>
        {stream.loading && (
          <button type="button" onClick={() => stream.abort()}>
            Stop
          </button>
        )}
      </form>

      {stream.text && (
        <div
          style={{
            padding: "1rem",
            background: "#f9fafb",
            borderRadius: "0.5rem",
            whiteSpace: "pre-wrap",
            opacity: stream.loading ? 0.8 : 1,
          }}
        >
          {stream.text}
          {stream.loading && "▌"}
        </div>
      )}

      {stream.error && (
        <div style={{ color: "#dc2626", padding: "1rem" }}>
          <p>{stream.error.message}</p>
          <button onClick={() => stream.retry()}>Retry</button>
        </div>
      )}
    </div>
  );
}
