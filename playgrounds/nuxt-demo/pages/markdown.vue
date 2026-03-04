<script setup lang="ts">
import { useStream } from "@aibind/nuxt";
import { StreamMarkdown } from "@aibind/nuxt/markdown";

const { text, loading, error, send, abort, retry } = useStream({
  system:
    "You are a helpful assistant. Always respond with rich markdown formatting: use headings, **bold**, *italic*, `inline code`, code blocks with language tags, bullet lists, and numbered lists where appropriate.",
  model: "gpt",
});

const prompt = ref("");

function handleSubmit() {
  send(prompt.value);
  prompt.value = "";
}
</script>

<template>
  <div>
    <h1>Markdown Demo</h1>
    <p>
      Streaming markdown with live recovery — unterminated syntax renders
      gracefully.
    </p>

    <form @submit.prevent="handleSubmit">
      <input
        v-model="prompt"
        placeholder="Ask something (try 'explain async/await')..."
      />
      <button type="submit" :disabled="loading">
        {{ loading ? "Streaming..." : "Send" }}
      </button>
      <button v-if="loading" type="button" @click="abort()">Stop</button>
    </form>

    <div v-if="text" class="response">
      <StreamMarkdown :text="text" :streaming="loading" />
    </div>

    <div v-if="error" class="error">
      <p>{{ error.message }}</p>
      <button @click="retry()">Retry</button>
    </div>
  </div>
</template>

<style scoped>
form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
input {
  flex: 1;
  padding: 0.5rem;
}
.response {
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.5rem;
}
.response :deep(pre) {
  background: #1f2937;
  color: #f9fafb;
  padding: 1rem;
  border-radius: 0.375rem;
  overflow-x: auto;
}
.response :deep(code) {
  font-size: 0.875rem;
}
.response :deep(p code) {
  background: #e5e7eb;
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
}
.error {
  color: #dc2626;
  padding: 1rem;
}
</style>
