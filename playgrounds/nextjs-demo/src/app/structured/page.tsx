"use client";

import { useState } from "react";
import { useStructuredStream } from "@aibind/nextjs";
import { z } from "zod/v4";

const AnalysisSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  score: z.number(),
  topics: z.array(z.string()),
  summary: z.string(),
});

export default function StructuredPage() {
  const [text, setText] = useState("");
  const analysis = useStructuredStream({
    schema: AnalysisSchema,
    system:
      "You are a sentiment analysis expert. Return valid JSON matching the schema.",
  });

  return (
    <div>
      <h1>Structured Stream Demo</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          analysis.send(`Analyze this text: ${text}`);
        }}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          marginBottom: "1rem",
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste text to analyze..."
          rows={4}
          style={{ padding: "0.5rem" }}
        />
        <button type="submit" disabled={analysis.loading}>
          {analysis.loading ? "Analyzing..." : "Analyze"}
        </button>
      </form>

      {analysis.partial && (
        <div
          style={{
            padding: "1rem",
            background: "#f9fafb",
            borderRadius: "0.5rem",
            opacity: analysis.loading ? 0.7 : 1,
          }}
        >
          {analysis.partial.sentiment && (
            <p>
              <strong>Sentiment:</strong> {analysis.partial.sentiment}
            </p>
          )}
          {analysis.partial.score != null && (
            <p>
              <strong>Score:</strong> {analysis.partial.score}
            </p>
          )}
          {analysis.partial.summary && (
            <p>
              <strong>Summary:</strong> {analysis.partial.summary}
            </p>
          )}
          {analysis.partial.topics?.length ? (
            <p>
              <strong>Topics:</strong> {analysis.partial.topics.join(", ")}
            </p>
          ) : null}
        </div>
      )}

      {analysis.error && (
        <div style={{ color: "#dc2626", padding: "1rem" }}>
          <p>{analysis.error.message}</p>
          <button onClick={() => analysis.retry()}>Retry</button>
        </div>
      )}
    </div>
  );
}
