import { useStream } from "@aibind/solidstart";
import { useStreamMarkdown } from "@aibind/solidstart/markdown";
import { Show, createSignal } from "solid-js";

export default function MarkdownPage() {
  const { text, loading, error, send, abort, retry } = useStream({
    system:
      "You are a helpful assistant. Always respond with rich markdown formatting: use headings, **bold**, *italic*, `inline code`, code blocks with language tags, bullet lists, and numbered lists where appropriate.",
    model: "gpt",
  });

  const html = useStreamMarkdown(
    () => text(),
    () => loading(),
  );
  const [prompt, setPrompt] = createSignal("");

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    send(prompt());
    setPrompt("");
  }

  return (
    <div>
      <h1>Markdown Demo</h1>
      <p>
        Streaming markdown with live recovery — unterminated syntax renders
        gracefully.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", gap: "0.5rem", "margin-bottom": "1rem" }}
      >
        <input
          value={prompt()}
          onInput={(e) => setPrompt(e.currentTarget.value)}
          placeholder="Ask something (try 'explain async/await')..."
          style={{ flex: "1", padding: "0.5rem" }}
        />
        <button type="submit" disabled={loading()}>
          {loading() ? "Streaming..." : "Send"}
        </button>
        <Show when={loading()}>
          <button type="button" onClick={() => abort()}>
            Stop
          </button>
        </Show>
      </form>

      <Show when={text()}>
        <div
          style={{
            padding: "1rem",
            background: "#f9fafb",
            "border-radius": "0.5rem",
          }}
          innerHTML={html()}
        />
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
