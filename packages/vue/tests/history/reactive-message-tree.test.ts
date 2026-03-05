import { describe, it, expect } from "vitest";
import { MessageTree } from "../../src/history/message-tree";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

let counter = 0;
const testConfig = { generateId: () => `id-${++counter}` };

function freshConfig() {
  counter = 0;
  return testConfig;
}

describe("MessageTree (Vue)", () => {
  it("starts empty with correct reactive defaults", () => {
    const tree = new MessageTree<Msg>();
    expect(tree.size.value).toBe(0);
    expect(tree.isEmpty.value).toBe(true);
    expect(tree.activeLeafId.value).toBeNull();
    expect(tree.rootIds.value).toEqual([]);
    expect(tree.activePath.value).toEqual({ messages: [], nodeIds: [] });
  });

  it("append updates activePath.value", () => {
    const tree = new MessageTree<Msg>(freshConfig());
    tree.append({ role: "user", content: "Hello" });
    expect(tree.activePath.value.messages).toHaveLength(1);
    expect(tree.activePath.value.messages[0].content).toBe("Hello");

    tree.append({ role: "assistant", content: "Hi!" });
    expect(tree.activePath.value.messages).toHaveLength(2);
    expect(tree.activePath.value.messages[1].content).toBe("Hi!");
  });

  it("append updates size.value and isEmpty.value", () => {
    const tree = new MessageTree<Msg>();
    expect(tree.isEmpty.value).toBe(true);
    expect(tree.size.value).toBe(0);

    tree.append({ role: "user", content: "hello" });
    expect(tree.isEmpty.value).toBe(false);
    expect(tree.size.value).toBe(1);
  });

  it("append updates activeLeafId.value", () => {
    const tree = new MessageTree<Msg>(freshConfig());
    const m1 = tree.append({ role: "user", content: "hello" });
    expect(tree.activeLeafId.value).toBe(m1);
    const m2 = tree.append({ role: "assistant", content: "hi" });
    expect(tree.activeLeafId.value).toBe(m2);
  });

  it("addRoot updates rootIds.value and sets active leaf", () => {
    const tree = new MessageTree<Msg>(freshConfig());
    const r1 = tree.addRoot({ role: "user", content: "first" });
    expect(tree.rootIds.value).toEqual([r1]);
    expect(tree.activeLeafId.value).toBe(r1);

    const r2 = tree.addRoot({ role: "user", content: "second" });
    expect(tree.rootIds.value).toEqual([r1, r2]);
    expect(tree.activeLeafId.value).toBe(r2);
  });

  it("branch creates sibling and updates activePath", () => {
    const tree = new MessageTree<Msg>(freshConfig());
    const m1 = tree.append({ role: "user", content: "hello" });
    tree.append({ role: "assistant", content: "response A" });
    const m2b = tree.branch(m1, { role: "assistant", content: "response B" });

    expect(tree.activeLeafId.value).toBe(m2b);
    expect(tree.activePath.value.messages).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "response B" },
    ]);
  });

  it("addChild does not update active leaf", () => {
    const tree = new MessageTree<Msg>(freshConfig());
    const m1 = tree.append({ role: "user", content: "hello" });
    tree.addChild(m1, { role: "assistant", content: "child" });
    // active leaf stays at m1 (addChild does not change it)
    expect(tree.activeLeafId.value).toBe(m1);
    expect(tree.size.value).toBe(2);
  });

  it("nextSibling and prevSibling update activePath.value", () => {
    const tree = new MessageTree<Msg>(freshConfig());
    const m1 = tree.append({ role: "user", content: "hello" });
    const c1 = tree.addChild(m1, { role: "assistant", content: "a" });
    const c2 = tree.addChild(m1, { role: "assistant", content: "b" });

    tree.setActiveLeaf(c1);
    expect(tree.activePath.value.messages[1].content).toBe("a");

    tree.nextSibling(c1);
    expect(tree.activeLeafId.value).toBe(c2);
    expect(tree.activePath.value.messages[1].content).toBe("b");

    tree.prevSibling(c2);
    expect(tree.activeLeafId.value).toBe(c1);
    expect(tree.activePath.value.messages[1].content).toBe("a");
  });

  it("setActiveLeaf updates activeLeafId.value", () => {
    const tree = new MessageTree<Msg>(freshConfig());
    const m1 = tree.append({ role: "user", content: "hello" });
    const m2 = tree.append({ role: "assistant", content: "hi" });
    expect(tree.activeLeafId.value).toBe(m2);

    tree.setActiveLeaf(m1);
    expect(tree.activeLeafId.value).toBe(m1);
  });

  it("remove updates size.value and activePath.value", () => {
    const tree = new MessageTree<Msg>(freshConfig());
    const m1 = tree.append({ role: "user", content: "hello" });
    const m2 = tree.append({ role: "assistant", content: "hi" });

    expect(tree.size.value).toBe(2);
    tree.remove(m2);
    expect(tree.size.value).toBe(1);
    expect(tree.activeLeafId.value).toBe(m1);
    expect(tree.activePath.value.messages).toHaveLength(1);
  });

  it("serialize and deserialize round-trip", () => {
    const tree = new MessageTree<Msg>(freshConfig());
    const m1 = tree.append({ role: "user", content: "hello" });
    tree.append({ role: "assistant", content: "hi" });
    tree.branch(m1, { role: "assistant", content: "hey" });

    const data = tree.serialize();
    const restored = MessageTree.deserialize<Msg>(data);

    expect(restored.size.value).toBe(3);
    expect(restored.activePath.value.messages).toEqual(
      tree.activePath.value.messages,
    );
    expect(restored.rootIds.value).toEqual(tree.rootIds.value);
  });

  it("deserialized instance is reactive", () => {
    const tree = new MessageTree<Msg>(freshConfig());
    tree.append({ role: "user", content: "hello" });
    tree.append({ role: "assistant", content: "hi" });

    const data = tree.serialize();
    const restored = MessageTree.deserialize<Msg>(data);

    // Mutate the restored tree and verify reactivity
    restored.append({ role: "user", content: "follow-up" });
    expect(restored.size.value).toBe(3);
    expect(restored.activePath.value.messages).toHaveLength(3);
    expect(restored.activePath.value.messages[2].content).toBe("follow-up");
  });

  it("query methods delegate correctly: get, has, getSiblings, depth, getLeaves", () => {
    const tree = new MessageTree<Msg>(freshConfig());
    const m1 = tree.append({ role: "user", content: "hello" });
    const c1 = tree.addChild(m1, { role: "assistant", content: "a" });
    const c2 = tree.addChild(m1, { role: "assistant", content: "b" });

    // get
    const node = tree.get(m1);
    expect(node).toBeDefined();
    expect(node!.message.content).toBe("hello");

    // has
    expect(tree.has(m1)).toBe(true);
    expect(tree.has("nonexistent")).toBe(false);

    // getSiblings
    const { siblings, index } = tree.getSiblings(c1);
    expect(siblings).toHaveLength(2);
    expect(index).toBe(0);

    // depth
    expect(tree.depth(m1)).toBe(0);
    expect(tree.depth(c1)).toBe(1);

    // getLeaves
    const leaves = tree.getLeaves();
    const leafIds = leaves.map((l) => l.id).sort();
    expect(leafIds).toEqual([c1, c2].sort());
  });

  it("getPathTo delegates correctly", () => {
    const tree = new MessageTree<Msg>(freshConfig());
    const m1 = tree.append({ role: "user", content: "hello" });
    const m2 = tree.append({ role: "assistant", content: "hi" });
    tree.append({ role: "user", content: "next" });

    const path = tree.getPathTo(m2);
    expect(path.nodeIds).toEqual([m1, m2]);
    expect(path.messages).toHaveLength(2);
  });
});
