import { useAgent } from "@aibind/solidstart/agent";
import { Show, For, createSignal } from "solid-js";

export default function AgentPage() {
  const { messages, status, error, send, stop } = useAgent({
    endpoint: "/api/agent",
  });

  const [prompt, setPrompt] = createSignal("");

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const text = prompt().trim();
    if (!text) return;
    send(text);
    setPrompt("");
  }

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        "min-height": "60vh",
      }}
    >
      <header style={{ "margin-bottom": "1.5rem" }}>
        <h1 style={{ margin: "0 0 0.25rem", "font-size": "1.5rem" }}>
          Agent Demo
        </h1>
        <p style={{ margin: "0", color: "#6b7280", "font-size": "0.875rem" }}>
          An AI agent with tool-calling capabilities — try asking about the
          weather or current time.
        </p>
      </header>

      <div
        style={{
          flex: "1",
          "overflow-y": "auto",
          display: "flex",
          "flex-direction": "column",
          gap: "0.75rem",
          "padding-bottom": "1rem",
        }}
      >
        <For each={messages()}>
          {(message) => (
            <div
              style={{
                padding: "0.75rem 1rem",
                "border-radius": "0.5rem",
                "max-width": "85%",
                background: message.role === "user" ? "#dbeafe" : "#f3f4f6",
                "align-self":
                  message.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <span
                style={{
                  display: "block",
                  "font-size": "0.7rem",
                  "font-weight": "600",
                  "text-transform": "uppercase",
                  "letter-spacing": "0.05em",
                  "margin-bottom": "0.25rem",
                  color: "#6b7280",
                }}
              >
                {message.role === "user" ? "You" : "Agent"}
              </span>
              <div
                style={{
                  "white-space": "pre-wrap",
                  "word-break": "break-word",
                  "font-size": "0.9375rem",
                  "line-height": "1.5",
                }}
              >
                {message.content}
              </div>
            </div>
          )}
        </For>

        <Show when={status() === "running"}>
          <div
            style={{
              padding: "0.75rem 1rem",
              "border-radius": "0.5rem",
              "max-width": "85%",
              background: "#f3f4f6",
              "align-self": "flex-start",
            }}
          >
            <span
              style={{
                display: "block",
                "font-size": "0.7rem",
                "font-weight": "600",
                "text-transform": "uppercase",
                "letter-spacing": "0.05em",
                "margin-bottom": "0.25rem",
                color: "#6b7280",
              }}
            >
              Agent
            </span>
            <div>
              <span
                style={{
                  display: "inline-block",
                  width: "8px",
                  height: "8px",
                  background: "#6366f1",
                  "border-radius": "50%",
                  animation: "pulse 1s ease-in-out infinite",
                }}
              />
            </div>
          </div>
        </Show>
      </div>

      <Show when={error()}>
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#dc2626",
            padding: "0.75rem 1rem",
            "border-radius": "0.5rem",
            "margin-bottom": "0.75rem",
            "font-size": "0.875rem",
          }}
        >
          <strong>Error:</strong> {error()!.message}
        </div>
      </Show>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: "0.5rem",
          "padding-top": "0.75rem",
          "border-top": "1px solid #e5e7eb",
        }}
      >
        <input
          value={prompt()}
          onInput={(e) => setPrompt(e.currentTarget.value)}
          placeholder="Ask about the weather, time, or anything..."
          disabled={status() === "running"}
          style={{
            flex: "1",
            padding: "0.625rem 0.75rem",
            border: "1px solid #d1d5db",
            "border-radius": "0.375rem",
            "font-size": "0.9375rem",
          }}
        />
        <Show
          when={status() === "running"}
          fallback={
            <button
              type="submit"
              disabled={!prompt().trim()}
              style={{
                padding: "0.625rem 1.25rem",
                border: "none",
                "border-radius": "0.375rem",
                "font-size": "0.875rem",
                "font-weight": "500",
                cursor: "pointer",
                background: "#4f46e5",
                color: "white",
              }}
            >
              Send
            </button>
          }
        >
          <button
            type="button"
            onClick={() => stop()}
            style={{
              padding: "0.625rem 1.25rem",
              border: "none",
              "border-radius": "0.375rem",
              "font-size": "0.875rem",
              "font-weight": "500",
              cursor: "pointer",
              background: "#dc2626",
              color: "white",
            }}
          >
            Stop
          </button>
        </Show>
      </form>
    </div>
  );
}
