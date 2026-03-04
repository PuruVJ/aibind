<template>
  <div>
    <nav>
      <NuxtLink to="/">Home</NuxtLink>
      <NuxtLink to="/stream">Stream</NuxtLink>
      <NuxtLink to="/structured">Structured</NuxtLink>
      <NuxtLink to="/agent">Agent</NuxtLink>
      <NuxtLink to="/markdown">Markdown</NuxtLink>
    </nav>
    <main>
      <NuxtPage />
    </main>
  </div>
</template>

<style>
nav {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}
nav a {
  color: #4f46e5;
  text-decoration: none;
}
nav a:hover {
  text-decoration: underline;
}
main {
  padding: 1rem;
  max-width: 48rem;
  margin: 0 auto;
}
</style>
