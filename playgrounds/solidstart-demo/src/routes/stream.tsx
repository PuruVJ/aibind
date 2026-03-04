import { useStream } from '@aibind/solidstart';
import { Show, createSignal } from 'solid-js';

export default function StreamPage() {
  const { text, loading, error, send, abort, retry } = useStream({
    system: 'You are a helpful assistant. Keep responses concise.',
    model: 'gpt',
  });

  const [prompt, setPrompt] = createSignal('');

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    send(prompt());
    setPrompt('');
  }

  return (
    <div>
      <h1>Stream Demo</h1>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.5rem", "margin-bottom": "1rem" }}>
        <input
          value={prompt()}
          onInput={(e) => setPrompt(e.currentTarget.value)}
          placeholder="Ask something..."
          style={{ flex: 1, padding: "0.5rem" }}
        />
        <button type="submit" disabled={loading()}>
          {loading() ? 'Streaming...' : 'Send'}
        </button>
        <Show when={loading()}>
          <button type="button" onClick={() => abort()}>Stop</button>
        </Show>
      </form>

      <Show when={text()}>
        <div style={{
          padding: "1rem",
          background: "#f9fafb",
          "border-radius": "0.5rem",
          "white-space": "pre-wrap",
          opacity: loading() ? "0.8" : "1",
        }}>
          {text()}<Show when={loading()}>▌</Show>
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
