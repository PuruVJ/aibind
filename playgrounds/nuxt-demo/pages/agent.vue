<script setup lang="ts">
import { useAgent } from '@aibind/nuxt/composables/agent';

const { messages, status, error, send, stop } = useAgent({
  endpoint: '/api/agent',
});

const prompt = ref('');

function handleSubmit() {
  const text = prompt.value.trim();
  if (!text) return;
  send(text);
  prompt.value = '';
}
</script>

<template>
  <div class="container">
    <header>
      <h1>Agent Demo</h1>
      <p class="subtitle">An AI agent with tool-calling capabilities — try asking about the weather or current time.</p>
    </header>

    <div class="messages">
      <div v-for="message in messages" :key="message.id" class="message" :class="message.role">
        <span class="role-label">{{ message.role === 'user' ? 'You' : 'Agent' }}</span>
        <div class="content">{{ message.content }}</div>
      </div>

      <div v-if="status === 'running'" class="message assistant">
        <span class="role-label">Agent</span>
        <div class="content">
          <span class="streaming-indicator" />
        </div>
      </div>
    </div>

    <div v-if="error" class="error">
      <strong>Error:</strong> {{ error.message }}
    </div>

    <form class="input-form" @submit.prevent="handleSubmit">
      <input
        v-model="prompt"
        placeholder="Ask about the weather, time, or anything..."
        :disabled="status === 'running'"
      />
      <button v-if="status === 'running'" type="button" class="stop-btn" @click="stop()">Stop</button>
      <button v-else type="submit" :disabled="!prompt.trim()">Send</button>
    </form>
  </div>
</template>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  min-height: 60vh;
}
header {
  margin-bottom: 1.5rem;
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
.messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-bottom: 1rem;
}
.message {
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  max-width: 85%;
}
.message.user {
  background: #dbeafe;
  align-self: flex-end;
  border-bottom-right-radius: 0.125rem;
}
.message.assistant {
  background: #f3f4f6;
  align-self: flex-start;
  border-bottom-left-radius: 0.125rem;
}
.role-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.25rem;
  color: #6b7280;
}
.content {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.9375rem;
  line-height: 1.5;
}
.streaming-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #6366f1;
  border-radius: 50%;
  animation: pulse 1s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}
.error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
}
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
</style>
