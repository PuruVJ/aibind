---
"@aibind/core": minor
---

## Tool call history in Chat messages

`ChatMessage.role` now includes `"tool"`. When the model invokes a tool during a chat turn, a `{ role: "tool", toolName, toolArgs }` message is inserted into `chat.messages[]` before the assistant's final response. UIs can render these as collapsible "Searched the web…" or "Called get_weather…" indicators.

Tool messages are automatically filtered from the payload sent to the server — they are UI-only and never included in the conversation history sent to the model.
