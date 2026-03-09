---
"@aibind/core": minor
---

## Structured streaming now uses AI SDK's native `partialOutputStream`

The `/structured` endpoint and `StructuredStreamController` have been refactored to use AI SDK v6's `streamText` with `output: Output.object(schema)` instead of hand-rolled partial JSON parsing.

### Breaking changes

**`parsePartialJSON` removed**

`parsePartialJSON` is no longer exported from `@aibind/core`. It was an internal utility used to parse incomplete JSON token streams client-side — this is now handled server-side by AI SDK.

**`StructuredStreamController` no longer extends `StreamController`**

`StructuredStreamController` now extends `BaseStreamController` directly. It does not accumulate raw text and does not expose a `text` getter, `onDiff`, or `onArtifacts` callbacks.

**`/structured` SSE wire format changed**

The server now emits typed named events instead of plain text chunks:

```
event: partial
data: {"sentiment":"positive","score":...}

event: data
data: {"sentiment":"positive","score":0.9,"topics":["quality"]}

event: usage
data: {"inputTokens":42,"outputTokens":18}

event: done
```

Any custom client consuming the raw SSE stream from `/structured` must be updated to handle these named events.

### New features

**`BaseStreamController` exported**

`BaseStreamController`, `BaseStreamCallbacks`, and `BaseStreamControllerOptions` are now exported from `@aibind/core`. Power users can extend the transport base class to build custom stream controllers without inheriting text/diff/artifact logic.

**More reliable partial objects**

Partial objects are now produced server-side by AI SDK's `partialOutputStream` — a typed `AsyncIterable` that emits structurally valid partial objects as they build up. This replaces the previous approach of parsing raw JSON token substrings on the client.
