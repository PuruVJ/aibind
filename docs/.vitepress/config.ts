import { defineConfig } from "vitepress";

export default defineConfig({
  title: "aibind",
  description: "Universal AI SDK bindings for every framework",
  base: "/",

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }],
    ["meta", { property: "og:image", content: "https://aibind.dev/og.png" }],
    ["meta", { property: "og:image:width", content: "1200" }],
    ["meta", { property: "og:image:height", content: "630" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:image", content: "https://aibind.dev/og.png" }],
  ],

  markdown: {
    theme: {
      light: "vitesse-light",
      dark: "vitesse-dark",
    },
  },

  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Concepts", link: "/concepts/streaming" },
      { text: "Frameworks", link: "/frameworks/sveltekit" },
      { text: "Patterns", link: "/patterns/chat-ui" },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Why aibind?", link: "/guide/why" },
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Installation", link: "/guide/installation" },
          { text: "Custom Routing", link: "/guide/custom-routing" },
        ],
      },
      {
        text: "Concepts",
        items: [
          // Core
          { text: "Streaming", link: "/concepts/streaming" },
          { text: "Structured Output", link: "/concepts/structured-output" },
          { text: "Markdown Rendering", link: "/concepts/markdown" },
          // Conversations
          { text: "Conversation Store", link: "/concepts/conversation-store" },
          { text: "Chat History", link: "/concepts/chat-history" },
          { text: "Message Trees", link: "/concepts/message-trees" },
          { text: "Compacting", link: "/concepts/compacting" },
          { text: "Projects", link: "/concepts/projects" },
          // Models
          { text: "Model Switching", link: "/concepts/model-switching" },
          { text: "Model Racing", link: "/concepts/model-racing" },
          // Intelligence
          { text: "Agents", link: "/concepts/agents" },
          { text: "Inline Completions", link: "/concepts/completions" },
          // Resilience & polish
          { text: "Durable Streams", link: "/concepts/durable-streams" },
          { text: "Streaming Diff", link: "/concepts/streaming-diff" },
          // Production
          { text: "Token Tracking", link: "/concepts/token-tracking" },
          { text: "Prompt Caching", link: "/concepts/prompt-caching" },
          // Zero-server
          { text: "Service Worker Mode", link: "/integrations/service-worker" },
        ],
      },
      {
        text: "Frameworks",
        items: [
          { text: "SvelteKit", link: "/frameworks/sveltekit" },
          { text: "Next.js", link: "/frameworks/nextjs" },
          { text: "Nuxt", link: "/frameworks/nuxt" },
          { text: "SolidStart", link: "/frameworks/solidstart" },
          { text: "TanStack Start", link: "/frameworks/tanstack-start" },
          { text: "React Router v7", link: "/frameworks/react-router" },
        ],
      },
      {
        text: "Patterns",
        items: [
          { text: "Chat UI", link: "/patterns/chat-ui" },
          { text: "Branching Chat", link: "/patterns/branching-chat" },
          { text: "Writing Assistant", link: "/patterns/writing-assistant" },
          { text: "Cost-Aware Chat", link: "/patterns/cost-aware-chat" },
          { text: "Resumable Chat", link: "/patterns/resumable-chat" },
          { text: "Model Race UI", link: "/patterns/model-race-ui" },
          {
            text: "Structured Analysis",
            link: "/patterns/structured-analysis",
          },
          { text: "Tool-calling Agent", link: "/patterns/tool-agent" },
        ],
      },
      {
        text: "Integrations",
        items: [
          { text: "Redis", link: "/integrations/redis" },
          { text: "SQLite / Turso", link: "/integrations/sqlite" },
          { text: "PostgreSQL", link: "/integrations/postgres" },
          { text: "Cloudflare (D1 + KV)", link: "/integrations/cloudflare" },
        ],
      },
    ],

    search: {
      provider: "local",
    },

    socialLinks: [{ icon: "github", link: "https://github.com/puruvj/aibind" }],

    footer: {
      message: "Released under the MIT License.",
    },
  },
});
