# @aibind/solid

Low-level SolidJS reactive hooks for AI streaming. **If you're using SolidStart, use [`@aibind/solidstart`](https://www.npmjs.com/package/@aibind/solidstart) instead** — it wraps this package with sensible defaults and server handlers.

## Features

🤏 **Tiny** — Ships only what you use. Tree-shakes per entry point.
🐇 **Simple** — Three hooks: `useStream`, `useStructuredStream`, `useAgent`. Call and go.
🧙‍♀️ **Elegant** — Returns SolidJS signals. Reactive by nature.
🗃️ **Highly customizable** — Custom endpoints, custom fetch, per-request system overrides, named model registries.
⚛️ **Reactive** — Every piece of state is a SolidJS signal. Fine-grained reactivity out of the box.

## Install

```bash
npm install @aibind/solid ai solid-js
```

> **Using SolidStart?** Install `@aibind/solidstart` instead — it includes this package and adds server handlers and default endpoints.

## Usage

This package requires you to specify an `endpoint` for every hook. For SolidStart projects, `@aibind/solidstart` provides defaults automatically.

```tsx
import { useStream } from "@aibind/solid";

function Chat() {
  const { text, loading, send } = useStream({
    endpoint: "/my/stream/endpoint", // required
    system: "You are a helpful assistant.",
  });

  return <p>{text()}</p>;
}
```

## Entry Points

| Entry                    | Exports                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `@aibind/solid`          | `useStream`, `useStructuredStream`, `defineModels`                      |
| `@aibind/solid/agent`    | `useAgent`                                                              |
| `@aibind/solid/markdown` | `useStreamMarkdown`, `StreamParser`, `HtmlRenderer`, `MarkdownRecovery` |

## Requirements

- SolidJS 1.8+
- AI SDK 6.0+

## License

MIT
