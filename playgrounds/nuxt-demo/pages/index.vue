<template>
  <div>
    <h1>aibind Nuxt Playground</h1>
    <p>Test the @aibind/nuxt library features:</p>
    <ul>
      <li><NuxtLink to="/stream">Stream — streaming text</NuxtLink></li>
      <li>
        <NuxtLink to="/structured"
          >StructuredStream — typed partial streaming</NuxtLink
        >
      </li>
      <li>
        <NuxtLink to="/agent"
          >Agent — tool-calling agent with weather &amp; time</NuxtLink
        >
      </li>
      <li>
        <NuxtLink to="/markdown"
          >Markdown — streaming markdown rendering</NuxtLink
        >
      </li>
    </ul>
  </div>
</template>
