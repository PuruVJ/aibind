<script setup lang="ts">
import { useStream } from "@aibind/nuxt";

const { text, loading, error, send, abort, retry } = useStream({
  system: "You are a helpful assistant. Keep responses concise.",
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
    <h1>Stream Demo</h1>

    <form @submit.prevent="handleSubmit">
      <input v-model="prompt" placeholder="Ask something..." />
      <button type="submit" :disabled="loading">
        {{ loading ? "Streaming..." : "Send" }}
      </button>
      <button v-if="loading" type="button" @click="abort()">Stop</button>
    </form>

    <div v-if="text" class="response" :class="{ streaming: loading }">
      {{ text }}<span v-if="loading">▌</span>
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
  white-space: pre-wrap;
}
.streaming {
  opacity: 0.8;
}
.error {
  color: #dc2626;
  padding: 1rem;
}
</style>
