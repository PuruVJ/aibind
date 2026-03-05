# Message Trees

`MessageTree` is the low-level tree data structure that powers `ChatHistory`. Use it directly when you need full control over the tree topology.

## When to Use MessageTree vs ChatHistory

- **ChatHistory** — Simpler API for standard chat UIs (append, edit, regenerate, navigate alternatives)
- **MessageTree** — Full tree operations (addChild, branch, setActiveLeaf, remove subtrees)

## Basic Usage

```ts
import { MessageTree } from "@aibind/sveltekit/history";

type Msg = { role: string; content: string };
const tree = new MessageTree<Msg>();

// Build a conversation
const r1 = tree.append({ role: "user", content: "Hello" });
const r2 = tree.append({ role: "assistant", content: "Hi!" });

// Branch from r1 with a different response
const alt = tree.branch(r1, { role: "assistant", content: "Hey there!" });

// Navigate between siblings
tree.nextSibling(alt); // switch to r2's branch
tree.prevSibling(r2); // switch back to alt's branch

// Get the active conversation path
const { messages, nodeIds } = tree.getActivePath();
```

## Properties (Reactive)

| Property       | Type                | Description                |
| -------------- | ------------------- | -------------------------- |
| `size`         | `number`            | Total nodes in the tree    |
| `isEmpty`      | `boolean`           | Whether tree has any nodes |
| `activeLeafId` | `string \| null`    | Currently active leaf node |
| `rootIds`      | `readonly string[]` | IDs of root-level nodes    |
| `activePath`   | `TreePath<M>`       | Messages from root to leaf |

## Mutation Methods

| Method                        | Description                            |
| ----------------------------- | -------------------------------------- |
| `append(message, metadata?)`  | Add to active path                     |
| `addRoot(message, metadata?)` | Add new root node                      |
| `addChild(parentId, msg)`     | Add child without changing active leaf |
| `branch(parentId, msg)`       | Add child AND set as active leaf       |
| `setActiveLeaf(nodeId)`       | Change which leaf is active            |
| `remove(nodeId)`              | Remove subtree                         |

## Query Methods

| Method                | Description                    |
| --------------------- | ------------------------------ |
| `get(id)`             | Get node by ID                 |
| `has(id)`             | Check if node exists           |
| `getPathTo(nodeId)`   | Get path from root to any node |
| `getSiblings(nodeId)` | Get sibling nodes and index    |
| `depth(nodeId)`       | Distance from root             |
| `getLeaves()`         | All leaf nodes                 |

## Serialization

```ts
// Serialize
const data = tree.serialize();

// Deserialize
const restored = MessageTree.deserialize(data);
```
