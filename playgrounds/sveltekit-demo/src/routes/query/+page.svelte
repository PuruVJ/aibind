<script lang="ts">
  import { summarize, analyze } from "./summarize.remote";

  let text = $state("");
  let summaryResult = $state<string | null>(null);
  let analysisResult = $state<{
    sentiment: string;
    topics: string[];
    wordCount: number;
  } | null>(null);
  let loading = $state<"summarize" | "analyze" | null>(null);
  let error = $state<string | null>(null);

  async function handleSummarize() {
    if (!text.trim()) return;
    loading = "summarize";
    error = null;
    summaryResult = null;
    try {
      summaryResult = await summarize(text);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to summarize";
    } finally {
      loading = null;
    }
  }

  async function handleAnalyze() {
    if (!text.trim()) return;
    loading = "analyze";
    error = null;
    analysisResult = null;
    try {
      analysisResult = await analyze(text);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to analyze";
    } finally {
      loading = null;
    }
  }
</script>

<h1>Query Demo</h1>
<p>
  Test <code>query</code> and <code>structuredQuery</code> remote functions — no streaming,
  just request/response.
</p>

<div class="input-section">
  <textarea
    bind:value={text}
    placeholder="Paste or type text to summarize or analyze..."
    rows="6"
  ></textarea>
  <div class="actions">
    <button
      onclick={handleSummarize}
      disabled={loading !== null || !text.trim()}
    >
      {loading === "summarize" ? "Summarizing..." : "Summarize"}
    </button>
    <button onclick={handleAnalyze} disabled={loading !== null || !text.trim()}>
      {loading === "analyze" ? "Analyzing..." : "Analyze"}
    </button>
  </div>
</div>

{#if error}
  <div class="error">
    <p>{error}</p>
  </div>
{/if}

{#if summaryResult}
  <div class="result">
    <h2>Summary</h2>
    <p class="summary-text">{summaryResult}</p>
  </div>
{/if}

{#if analysisResult}
  <div class="result">
    <h2>Analysis</h2>
    <p><strong>Sentiment:</strong> {analysisResult.sentiment}</p>
    <p><strong>Topics:</strong> {analysisResult.topics.join(", ")}</p>
    <p><strong>Word Count:</strong> {analysisResult.wordCount}</p>
  </div>
{/if}

<style>
  p code {
    background: #f3f4f6;
    padding: 0.15rem 0.35rem;
    border-radius: 0.25rem;
    font-size: 0.9em;
  }
  .input-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  textarea {
    padding: 0.5rem;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
  .result {
    padding: 1rem;
    background: #f9fafb;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }
  .result h2 {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
  }
  .summary-text {
    white-space: pre-wrap;
  }
  .error {
    color: #dc2626;
    padding: 1rem;
  }
</style>
