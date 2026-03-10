<script lang="ts">
  import { Agent } from "@aibind/sveltekit/agent";

  const agent = new Agent({ endpoint: "/api/svai/graph-agent" });

  let prompt = $state("");

  // The pipeline nodes in order, for the visual graph
  const NODES = [
    {
      id: "research",
      label: "Research",
      icon: "🔍",
      description: "Gathers facts & uses tools",
    },
    {
      id: "analyze",
      label: "Analyze",
      icon: "🧠",
      description: "Extracts patterns & insights",
    },
    {
      id: "summarize",
      label: "Summarize",
      icon: "✍️",
      description: "Writes the final answer",
    },
  ] as const;

  // Derive visited nodes purely from messages — each assistant/tool message
  // carries a nodeId stamp set by AgentController on node-enter. No effects needed.
  const visitedNodes = $derived(
    new Set(agent.messages.filter((m) => m.nodeId).map((m) => m.nodeId!)),
  );

  function getNodeState(id: string): "idle" | "active" | "done" {
    if (agent.currentNode === id) return "active";
    if (visitedNodes.has(id)) return "done";
    return "idle";
  }

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text) return;
    agent.send(text);
    prompt = "";
  }
</script>

<div class="demo">
  <header>
    <h1>Graph Agent Pipeline</h1>
    <p class="subtitle">
      A LangGraph-style state machine: each node runs its own AI step. Watch the
      pipeline execute in real time.
    </p>
  </header>

  <!-- Visual graph -->
  <div class="graph" aria-label="Pipeline graph">
    {#each NODES as node, i}
      {@const state = getNodeState(node.id)}
      <div class="node-wrapper">
        <div class="node {state}" title={node.description}>
          <span class="node-icon">{node.icon}</span>
          <span class="node-label">{node.label}</span>
          {#if state === "active"}
            <span class="node-spinner"></span>
          {:else if state === "done"}
            <span class="node-check">✓</span>
          {/if}
        </div>
        {#if i < NODES.length - 1}
          <div class="edge" class:lit={visitedNodes.has(node.id)}></div>
        {/if}
      </div>
    {/each}
  </div>

  {#if agent.currentNode}
    <div class="status-bar">
      <span class="status-dot"></span>
      Running <strong>{agent.currentNode}</strong> node…
    </div>
  {/if}

  <!-- Message timeline -->
  {#if agent.messages.length > 0}
    <div class="timeline">
      {#each agent.messages as msg (msg.id)}
        {#if msg.role === "user"}
          <div class="timeline-item user">
            <span class="tl-role">You</span>
            <div class="tl-content">{msg.content}</div>
          </div>
        {:else if msg.role === "tool"}
          <div class="timeline-item tool">
            <span class="tl-role tool-name">⚡ {msg.toolName}</span>
            <div class="tl-content tool-args">
              {#if msg.toolStatus === "running"}
                <em>calling…</em>
              {:else}
                <code>{JSON.stringify(msg.toolArgs, null, 2)}</code>
                {#if msg.result}
                  <div class="tool-result">
                    → <code>{JSON.stringify(msg.result, null, 2)}</code>
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        {:else if msg.role === "assistant"}
          {@const nodeInfo = NODES.find((n) => n.id === msg.nodeId)}
          <div class="timeline-item assistant">
            <span class="tl-role">
              {#if nodeInfo}
                {nodeInfo.icon}
                {nodeInfo.label}
              {:else}
                Agent
              {/if}
            </span>
            <div class="tl-content">
              {#if msg.content}
                {msg.content}
              {:else if agent.status === "running" && agent.currentNode === msg.nodeId}
                <span class="thinking"></span>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {:else if agent.status === "idle"}
    <div class="empty-state">
      <p>
        Ask anything — try <em
          >"What's the weather in Tokyo and what time is it?"</em
        >
        or <em>"Explain quantum entanglement simply."</em>
      </p>
    </div>
  {/if}

  {#if agent.error}
    <div class="error">
      <strong>Error:</strong>
      {agent.error.message}
    </div>
  {/if}

  <form class="input-form" onsubmit={handleSubmit}>
    <input
      bind:value={prompt}
      placeholder="Ask anything…"
      disabled={agent.status === "running"}
    />
    {#if agent.status === "running"}
      <button type="button" class="stop-btn" onclick={() => agent.stop()}>
        Stop
      </button>
    {:else}
      <button type="submit" disabled={!prompt.trim()}>Send</button>
    {/if}
  </form>
</div>

<style>
  .demo {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  header {
    margin-bottom: 0;
  }
  h1 {
    margin: 0 0 0.25rem;
    font-size: 1.5rem;
  }
  .subtitle {
    margin: 0;
    color: #6b7280;
    font-size: 0.875rem;
  }

  /* ── Graph ── */
  .graph {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 1.25rem 1.5rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
  }

  .node-wrapper {
    display: flex;
    align-items: center;
  }

  .node {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem 1rem;
    border-radius: 0.625rem;
    border: 2px solid #e5e7eb;
    background: #fff;
    min-width: 6rem;
    transition:
      border-color 0.2s,
      box-shadow 0.2s,
      background 0.2s;
    cursor: default;
  }

  .node.active {
    border-color: #6366f1;
    background: #eef2ff;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
  }

  .node.done {
    border-color: #10b981;
    background: #ecfdf5;
  }

  .node-icon {
    font-size: 1.5rem;
    line-height: 1;
  }

  .node-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .node-spinner {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 12px;
    height: 12px;
    border: 2px solid #6366f1;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .node-check {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 16px;
    height: 16px;
    background: #10b981;
    color: white;
    border-radius: 50%;
    font-size: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
  }

  .edge {
    width: 2.5rem;
    height: 2px;
    background: #e5e7eb;
    position: relative;
    flex-shrink: 0;
    transition: background 0.3s;
  }

  .edge::after {
    content: "";
    position: absolute;
    right: -4px;
    top: -4px;
    border: 4px solid transparent;
    border-left-color: #e5e7eb;
    transition: border-left-color 0.3s;
  }

  .edge.lit {
    background: #10b981;
  }

  .edge.lit::after {
    border-left-color: #10b981;
  }

  /* ── Status bar ── */
  .status-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: #4f46e5;
    background: #eef2ff;
    padding: 0.5rem 0.875rem;
    border-radius: 0.5rem;
    border: 1px solid #c7d2fe;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    background: #6366f1;
    border-radius: 50%;
    animation: pulse 1s ease-in-out infinite;
    flex-shrink: 0;
  }

  /* ── Timeline ── */
  .timeline {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .timeline-item {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    max-width: 90%;
  }

  .timeline-item.user {
    align-self: flex-end;
  }

  .tl-role {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9ca3af;
    padding: 0 0.25rem;
  }

  .tl-role.tool-name {
    color: #d97706;
  }

  .tl-content {
    padding: 0.625rem 0.875rem;
    border-radius: 0.5rem;
    font-size: 0.9375rem;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .timeline-item.user .tl-content {
    background: #dbeafe;
    border-bottom-right-radius: 0.125rem;
  }

  .timeline-item.assistant .tl-content {
    background: #f3f4f6;
    border-bottom-left-radius: 0.125rem;
  }

  .timeline-item.tool .tl-content {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
  }

  .tool-args code {
    font-family: monospace;
    white-space: pre;
    display: block;
  }

  .tool-result {
    margin-top: 0.375rem;
    color: #065f46;
  }

  .thinking {
    display: inline-block;
    width: 6px;
    height: 6px;
    background: #6366f1;
    border-radius: 50%;
    animation: pulse 1s ease-in-out infinite;
  }

  /* ── Empty state ── */
  .empty-state {
    text-align: center;
    padding: 2rem 1rem;
    color: #9ca3af;
    font-size: 0.9375rem;
  }

  .empty-state em {
    color: #6366f1;
    font-style: normal;
  }

  /* ── Error ── */
  .error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
  }

  /* ── Input form ── */
  .input-form {
    display: flex;
    gap: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid #e5e7eb;
  }

  input {
    flex: 1;
    padding: 0.625rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.9375rem;
    outline: none;
    transition: border-color 0.15s;
  }

  input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
  }

  input:disabled {
    background: #f9fafb;
    color: #9ca3af;
  }

  button {
    padding: 0.625rem 1.25rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    background: #4f46e5;
    color: white;
  }

  button:hover:not(:disabled) {
    background: #4338ca;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .stop-btn {
    background: #dc2626;
  }

  .stop-btn:hover {
    background: #b91c1c;
  }

  /* ── Animations ── */
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.4;
      transform: scale(0.8);
    }
    50% {
      opacity: 1;
      transform: scale(1.2);
    }
  }
</style>
