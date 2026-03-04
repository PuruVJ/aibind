<script setup lang="ts">
import { useStructuredStream } from '@aibind/nuxt';
import { z } from 'zod';

const AnalysisSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  score: z.number(),
  topics: z.array(z.string()),
  summary: z.string(),
});

const { partial, loading, error, send, retry } = useStructuredStream({
  schema: AnalysisSchema,
  system: 'You are a sentiment analysis expert. Return valid JSON matching the schema.',
});

const text = ref('');
</script>

<template>
  <div>
    <h1>StructuredStream Demo</h1>

    <form @submit.prevent="send(`Analyze this text: ${text}`)">
      <textarea v-model="text" placeholder="Paste text to analyze..." rows="4" />
      <button type="submit" :disabled="loading">
        {{ loading ? 'Analyzing...' : 'Analyze' }}
      </button>
    </form>

    <div v-if="partial" class="result" :class="{ loading }">
      <p v-if="partial.sentiment"><strong>Sentiment:</strong> {{ partial.sentiment }}</p>
      <p v-if="partial.score != null"><strong>Score:</strong> {{ partial.score }}</p>
      <p v-if="partial.summary"><strong>Summary:</strong> {{ partial.summary }}</p>
      <p v-if="partial.topics?.length"><strong>Topics:</strong> {{ partial.topics.join(', ') }}</p>
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
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
textarea {
  padding: 0.5rem;
}
.result {
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.5rem;
}
.loading {
  opacity: 0.7;
}
.error {
  color: #dc2626;
  padding: 1rem;
}
</style>
