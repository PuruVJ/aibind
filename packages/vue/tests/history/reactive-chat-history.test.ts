import { describe, it, expect } from "vitest";
import { ReactiveChatHistory } from "../../src/history/reactive-chat-history";

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

describe("ReactiveChatHistory (Vue)", () => {
  it("starts empty", () => {
    const chat = new ReactiveChatHistory<Msg>();
    expect(chat.messages.value).toEqual([]);
    expect(chat.nodeIds.value).toEqual([]);
    expect(chat.isEmpty.value).toBe(true);
    expect(chat.size.value).toBe(0);
  });

  it("append updates messages.value", () => {
    const chat = new ReactiveChatHistory<Msg>();
    expect(chat.messages.value).toEqual([]);
    chat.append({ role: "user", content: "Hello" });
    expect(chat.messages.value).toHaveLength(1);
    expect(chat.messages.value[0].content).toBe("Hello");
  });

  it("append returns node ID", () => {
    const chat = new ReactiveChatHistory<Msg>(freshConfig());
    const id = chat.append({ role: "user", content: "Hello" });
    expect(id).toBe("id-1");
  });

  it("multiple appends build linear conversation", () => {
    const chat = new ReactiveChatHistory<Msg>(freshConfig());
    chat.append({ role: "user", content: "hello" });
    chat.append({ role: "assistant", content: "hi!" });
    chat.append({ role: "user", content: "how are you?" });
    expect(chat.messages.value).toHaveLength(3);
    expect(chat.messages.value.map((m) => m.content)).toEqual([
      "hello",
      "hi!",
      "how are you?",
    ]);
  });

  it("nodeIds.value updates after mutations", () => {
    const chat = new ReactiveChatHistory<Msg>(freshConfig());
    const m1 = chat.append({ role: "user", content: "a" });
    const m2 = chat.append({ role: "assistant", content: "b" });
    expect(chat.nodeIds.value).toEqual([m1, m2]);
  });

  it("isEmpty.value becomes false after append", () => {
    const chat = new ReactiveChatHistory<Msg>();
    expect(chat.isEmpty.value).toBe(true);
    chat.append({ role: "user", content: "hello" });
    expect(chat.isEmpty.value).toBe(false);
  });

  it("size.value tracks total nodes across branches", () => {
    const chat = new ReactiveChatHistory<Msg>(freshConfig());
    chat.append({ role: "user", content: "hello" });
    const m2 = chat.append({ role: "assistant", content: "a" });
    expect(chat.size.value).toBe(2);
    chat.regenerate(m2, { role: "assistant", content: "b" });
    expect(chat.size.value).toBe(3);
  });

  it("edit creates a branch and updates messages", () => {
    const chat = new ReactiveChatHistory<Msg>(freshConfig());
    const m1 = chat.append({ role: "user", content: "hello" });
    chat.append({ role: "assistant", content: "hi" });
    expect(chat.messages.value).toHaveLength(2);

    const m1b = chat.edit(m1, { role: "user", content: "hey" });
    expect(m1b).not.toBe(m1);
    expect(chat.messages.value).toHaveLength(1);
    expect(chat.messages.value[0].content).toBe("hey");
  });

  it("regenerate creates alternative response", () => {
    const chat = new ReactiveChatHistory<Msg>(freshConfig());
    chat.append({ role: "user", content: "hello" });
    const m2 = chat.append({ role: "assistant", content: "response 1" });

    const m2b = chat.regenerate(m2, {
      role: "assistant",
      content: "response 2",
    });
    expect(m2b).not.toBe(m2);
    expect(chat.messages.value).toHaveLength(2);
    expect(chat.messages.value[1].content).toBe("response 2");
  });

  it("hasAlternatives returns false for single child", () => {
    const chat = new ReactiveChatHistory<Msg>(freshConfig());
    chat.append({ role: "user", content: "hello" });
    const m2 = chat.append({ role: "assistant", content: "hi" });
    expect(chat.hasAlternatives(m2)).toBe(false);
  });

  it("hasAlternatives returns true after regenerate", () => {
    const chat = new ReactiveChatHistory<Msg>(freshConfig());
    chat.append({ role: "user", content: "hello" });
    const m2 = chat.append({ role: "assistant", content: "response 1" });
    chat.regenerate(m2, { role: "assistant", content: "response 2" });
    expect(chat.hasAlternatives(m2)).toBe(true);
  });

  it("alternativeCount and alternativeIndex", () => {
    const chat = new ReactiveChatHistory<Msg>(freshConfig());
    chat.append({ role: "user", content: "hello" });
    const m2 = chat.append({ role: "assistant", content: "a" });
    const m2b = chat.regenerate(m2, { role: "assistant", content: "b" });
    const m2c = chat.regenerate(m2, { role: "assistant", content: "c" });

    expect(chat.alternativeCount(m2)).toBe(3);
    expect(chat.alternativeIndex(m2)).toBe(0);
    expect(chat.alternativeIndex(m2b)).toBe(1);
    expect(chat.alternativeIndex(m2c)).toBe(2);
  });

  it("nextAlternative switches branch and updates messages.value", () => {
    const chat = new ReactiveChatHistory<Msg>(freshConfig());
    chat.append({ role: "user", content: "hello" });
    const m2 = chat.append({ role: "assistant", content: "response 1" });
    chat.regenerate(m2, { role: "assistant", content: "response 2" });

    // Currently on response 2 (regenerate set it active)
    expect(chat.messages.value[1].content).toBe("response 2");

    // Navigate back to response 1
    chat.prevAlternative(chat.nodeIds.value[1]);
    expect(chat.messages.value[1].content).toBe("response 1");

    // Navigate forward to response 2
    chat.nextAlternative(chat.nodeIds.value[1]);
    expect(chat.messages.value[1].content).toBe("response 2");
  });

  it("prevAlternative switches branch", () => {
    const chat = new ReactiveChatHistory<Msg>(freshConfig());
    chat.append({ role: "user", content: "hello" });
    const m2 = chat.append({ role: "assistant", content: "a" });
    const m2b = chat.regenerate(m2, { role: "assistant", content: "b" });

    // Currently on 'b' (active after regenerate)
    expect(chat.messages.value[1].content).toBe("b");
    chat.prevAlternative(m2b);
    expect(chat.messages.value[1].content).toBe("a");
  });

  it("toJSON and fromJSON round-trip", () => {
    const chat = new ReactiveChatHistory<Msg>(freshConfig());
    chat.append({ role: "user", content: "hello" });
    chat.append({ role: "assistant", content: "hi" });

    const json = chat.toJSON();
    expect(() => JSON.parse(json)).not.toThrow();

    const restored = ReactiveChatHistory.fromJSON<Msg>(json);
    expect(restored.messages.value).toEqual(chat.messages.value);
    expect(restored.size.value).toBe(chat.size.value);
  });

  it("fromJSON preserves branches and reactive state", () => {
    const chat = new ReactiveChatHistory<Msg>(freshConfig());
    chat.append({ role: "user", content: "hello" });
    const m2 = chat.append({ role: "assistant", content: "response 1" });
    chat.regenerate(m2, { role: "assistant", content: "response 2" });

    const restored = ReactiveChatHistory.fromJSON<Msg>(chat.toJSON());
    expect(restored.messages.value).toEqual(chat.messages.value);
    expect(restored.size.value).toBe(3);

    // Verify the restored instance is reactive: mutate and check
    restored.append({ role: "user", content: "follow-up" });
    expect(restored.messages.value).toHaveLength(3);
    expect(restored.messages.value[2].content).toBe("follow-up");
  });

  it("inner property provides access to underlying ChatHistory", () => {
    const chat = new ReactiveChatHistory<Msg>(freshConfig());
    chat.append({ role: "user", content: "hello" });
    chat.append({ role: "assistant", content: "hi" });

    expect(chat.inner).toBeDefined();
    expect(chat.inner.tree).toBeDefined();
    expect(chat.inner.tree.size).toBe(2);
    expect(chat.inner.tree.getLeaves()).toHaveLength(1);
  });
});
