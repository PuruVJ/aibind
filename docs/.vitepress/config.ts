import { defineConfig } from "vitepress";

export default defineConfig({
  title: "aibind",
  description: "Universal AI SDK bindings for every framework",
  base: "/",

  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }]],

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
          { text: "Streaming", link: "/concepts/streaming" },
          { text: "Structured Output", link: "/concepts/structured-output" },
          { text: "Agents", link: "/concepts/agents" },
          { text: "Chat History", link: "/concepts/chat-history" },
          { text: "Message Trees", link: "/concepts/message-trees" },
          { text: "Projects", link: "/concepts/projects" },
          { text: "Markdown Rendering", link: "/concepts/markdown" },
          { text: "Durable Streams", link: "/concepts/durable-streams" },
          { text: "Conversation Store", link: "/concepts/conversation-store" },
          { text: "Compacting", link: "/concepts/compacting" },
          { text: "Model Switching", link: "/concepts/model-switching" },
          { text: "Inline Completions", link: "/concepts/completions" },
          { text: "Streaming Diff", link: "/concepts/streaming-diff" },
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
          {
            text: "Structured Analysis",
            link: "/patterns/structured-analysis",
          },
          { text: "Tool-calling Agent", link: "/patterns/tool-agent" },
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
