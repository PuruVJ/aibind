import { useStructuredStream } from '@aibind/solidstart';
import { Show, createSignal } from 'solid-js';
import { z } from 'zod';

const AnalysisSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  score: z.number(),
  topics: z.array(z.string()),
  summary: z.string(),
});

export default function StructuredPage() {
  const { partial, loading, error, send, retry } = useStructuredStream({
    schema: AnalysisSchema,
    system: 'You are a sentiment analysis expert. Return valid JSON matching the schema.',
  });

  const [text, setText] = createSignal('');

  return (
    <div>
      <h1>StructuredStream Demo</h1>

      <form
        onSubmit={(e) => { e.preventDefault(); send(`Analyze this text: ${text()}`); }}
        style={{ display: "flex", "flex-direction": "column", gap: "0.5rem", "margin-bottom": "1rem" }}
      >
        <textarea
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
          placeholder="Paste text to analyze..."
          rows="4"
          style={{ padding: "0.5rem" }}
        />
        <button type="submit" disabled={loading()}>
          {loading() ? 'Analyzing...' : 'Analyze'}
        </button>
      </form>

      <Show when={partial()}>
        <div style={{
          padding: "1rem",
          background: "#f9fafb",
          "border-radius": "0.5rem",
          opacity: loading() ? "0.7" : "1",
        }}>
          <Show when={partial()!.sentiment}>
            <p><strong>Sentiment:</strong> {partial()!.sentiment}</p>
          </Show>
          <Show when={partial()!.score != null}>
            <p><strong>Score:</strong> {partial()!.score}</p>
          </Show>
          <Show when={partial()!.summary}>
            <p><strong>Summary:</strong> {partial()!.summary}</p>
          </Show>
          <Show when={partial()!.topics?.length}>
            <p><strong>Topics:</strong> {partial()!.topics!.join(', ')}</p>
          </Show>
        </div>
      </Show>

      <Show when={error()}>
        <div style={{ color: "#dc2626", padding: "1rem" }}>
          <p>{error()!.message}</p>
          <button onClick={() => retry()}>Retry</button>
        </div>
      </Show>
    </div>
  );
}
