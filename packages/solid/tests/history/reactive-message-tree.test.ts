import { describe, it, expect } from "vitest";
import { createRoot } from "solid-js";
import { ReactiveMessageTree } from "../../src/history/reactive-message-tree";

interface Msg {
  role: "user" | "assistant" | "system";
  content: string;
}

let counter = 0;
const testConfig = { generateId: () => `id-${++counter}` };

function freshConfig() {
  counter = 0;
  return testConfig;
}

describe("ReactiveMessageTree (Solid)", () => {
  it("starts empty with correct defaults", () => {
    createRoot((dispose) => {
      const tree = new ReactiveMessageTree<Msg>();
      expect(tree.size()).toBe(0);
      expect(tree.isEmpty()).toBe(true);
      expect(tree.activeLeafId()).toBeNull();
      expect(tree.rootIds()).toEqual([]);
      expect(tree.activePath()).toEqual({ messages: [], nodeIds: [] });
      dispose();
    });
  });

  it("append creates root on empty tree and updates reactives", () => {
    createRoot((dispose) => {
      const tree = new ReactiveMessageTree<Msg>(freshConfig());
      const id = tree.append({ role: "user", content: "hello" });

      expect(tree.size()).toBe(1);
      expect(tree.isEmpty()).toBe(false);
      expect(tree.activeLeafId()).toBe(id);
      expect(tree.rootIds()).toEqual([id]);
      expect(tree.activePath().messages).toEqual([
        { role: "user", content: "hello" },
      ]);
      dispose();
    });
  });

  it("append chains messages and updates activePath", () => {
    createRoot((dispose) => {
      const tree = new ReactiveMessageTree<Msg>(freshConfig());
      tree.append({ role: "user", content: "hello" });
      tree.append({ role: "assistant", content: "hi!" });
      tree.append({ role: "user", content: "how are you?" });

      expect(tree.size()).toBe(3);
      expect(tree.activePath().messages.map((m) => m.content)).toEqual([
        "hello",
        "hi!",
        "how are you?",
      ]);
      dispose();
    });
  });

  it("addRoot adds multiple roots", () => {
    createRoot((dispose) => {
      const tree = new ReactiveMessageTree<Msg>(freshConfig());
      const r1 = tree.addRoot({ role: "user", content: "first" });
      const r2 = tree.addRoot({ role: "user", content: "second" });

      expect(tree.rootIds()).toEqual([r1, r2]);
      expect(tree.activeLeafId()).toBe(r2);
      expect(tree.size()).toBe(2);
      dispose();
    });
  });

  it("branch creates sibling and updates activePath", () => {
    createRoot((dispose) => {
      const tree = new ReactiveMessageTree<Msg>(freshConfig());
      const m1 = tree.append({ role: "user", content: "hello" });
      const m2 = tree.append({ role: "assistant", content: "response A" });
      const m2b = tree.branch(m1, { role: "assistant", content: "response B" });

      expect(tree.activeLeafId()).toBe(m2b);
      expect(tree.activePath().messages).toEqual([
        { role: "user", content: "hello" },
        { role: "assistant", content: "response B" },
      ]);
      expect(tree.size()).toBe(3);
      dispose();
    });
  });

  it("setActiveLeaf updates activeLeafId and activePath", () => {
    createRoot((dispose) => {
      const tree = new ReactiveMessageTree<Msg>(freshConfig());
      const m1 = tree.append({ role: "user", content: "hello" });
      const m2 = tree.append({ role: "assistant", content: "hi" });

      tree.setActiveLeaf(m1);
      expect(tree.activeLeafId()).toBe(m1);
      expect(tree.activePath().messages).toHaveLength(1);

      tree.setActiveLeaf(m2);
      expect(tree.activeLeafId()).toBe(m2);
      expect(tree.activePath().messages).toHaveLength(2);
      dispose();
    });
  });

  it("nextSibling and prevSibling navigate between siblings", () => {
    createRoot((dispose) => {
      const tree = new ReactiveMessageTree<Msg>(freshConfig());
      const m1 = tree.append({ role: "user", content: "hello" });
      const c1 = tree.addChild(m1, { role: "assistant", content: "a" });
      const c2 = tree.addChild(m1, { role: "assistant", content: "b" });

      tree.setActiveLeaf(c1);
      expect(tree.activeLeafId()).toBe(c1);

      const result = tree.nextSibling(c1);
      expect(result).toBe(c2);
      expect(tree.activeLeafId()).toBe(c2);

      const prev = tree.prevSibling(c2);
      expect(prev).toBe(c1);
      expect(tree.activeLeafId()).toBe(c1);
      dispose();
    });
  });

  it("nextSibling returns null at boundary", () => {
    createRoot((dispose) => {
      const tree = new ReactiveMessageTree<Msg>(freshConfig());
      const m1 = tree.append({ role: "user", content: "hello" });
      const c1 = tree.addChild(m1, { role: "assistant", content: "only" });

      const result = tree.nextSibling(c1);
      expect(result).toBeNull();
      dispose();
    });
  });

  it("remove updates size and activePath", () => {
    createRoot((dispose) => {
      const tree = new ReactiveMessageTree<Msg>(freshConfig());
      const m1 = tree.append({ role: "user", content: "hello" });
      const m2 = tree.append({ role: "assistant", content: "hi" });

      expect(tree.size()).toBe(2);
      tree.remove(m2);
      expect(tree.size()).toBe(1);
      expect(tree.activeLeafId()).toBe(m1);
      expect(tree.has(m2)).toBe(false);
      dispose();
    });
  });

  it("query methods delegate correctly", () => {
    createRoot((dispose) => {
      const tree = new ReactiveMessageTree<Msg>(freshConfig());
      const m1 = tree.append({ role: "user", content: "hello" });
      const m2 = tree.append({ role: "assistant", content: "hi" });

      // get
      const node = tree.get(m1);
      expect(node).toBeDefined();
      expect(node!.message.content).toBe("hello");

      // has
      expect(tree.has(m1)).toBe(true);
      expect(tree.has("nonexistent")).toBe(false);

      // getPathTo
      const path = tree.getPathTo(m2);
      expect(path.nodeIds).toEqual([m1, m2]);

      // getSiblings
      const { siblings, index } = tree.getSiblings(m2);
      expect(siblings).toHaveLength(1);
      expect(index).toBe(0);

      // depth
      expect(tree.depth(m1)).toBe(0);
      expect(tree.depth(m2)).toBe(1);

      // getLeaves
      const leaves = tree.getLeaves();
      expect(leaves).toHaveLength(1);
      expect(leaves[0].id).toBe(m2);
      dispose();
    });
  });

  it("serialize and deserialize round-trip", () => {
    createRoot((dispose) => {
      const tree = new ReactiveMessageTree<Msg>(freshConfig());
      const m1 = tree.append(
        { role: "user", content: "hello" },
        { model: "gpt-4" },
      );
      tree.append({ role: "assistant", content: "hi" });
      tree.branch(m1, { role: "assistant", content: "hey" });

      const data = tree.serialize();
      expect(data.version).toBe(1);
      expect(Object.keys(data.nodes)).toHaveLength(3);

      const restored = ReactiveMessageTree.deserialize<Msg>(data);
      expect(restored.size()).toBe(3);
      expect(restored.activePath().messages).toEqual(
        tree.activePath().messages,
      );
      expect(restored.rootIds()).toEqual(tree.rootIds());
      expect(restored.activeLeafId()).toBe(tree.activeLeafId());

      // Restored instance should still be mutable/reactive
      restored.append({ role: "user", content: "more" });
      expect(restored.size()).toBe(4);
      dispose();
    });
  });
});
