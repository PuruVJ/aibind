import { describe, it, expect } from "vitest";
import { ChatHistory } from "../src/chat-history";

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

describe("ChatHistory", () => {
  describe("append", () => {
    it("appends messages and builds linear conversation", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      chat.append({ role: "user", content: "hello" });
      chat.append({ role: "assistant", content: "hi!" });
      expect(chat.messages).toEqual([
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi!" },
      ]);
    });

    it("returns node ID", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      const id = chat.append({ role: "user", content: "hello" });
      expect(id).toBe("id-1");
    });
  });

  describe("edit", () => {
    it("creates a branch from the edited message parent", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      const m1 = chat.append({ role: "user", content: "hello" });
      chat.append({ role: "assistant", content: "hi" });

      const m1b = chat.edit(m1, { role: "user", content: "hey" });
      expect(chat.messages).toEqual([{ role: "user", content: "hey" }]);
      expect(m1b).not.toBe(m1);
    });

    it("edits root message by adding new root", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      const m1 = chat.append({ role: "user", content: "hello" });
      chat.append({ role: "assistant", content: "hi" });

      chat.edit(m1, { role: "user", content: "hey there" });
      expect(chat.messages).toEqual([{ role: "user", content: "hey there" }]);
    });

    it("edits non-root message correctly", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      chat.append({ role: "user", content: "hello" });
      const m2 = chat.append({ role: "assistant", content: "hi" });
      chat.append({ role: "user", content: "how are you?" });

      chat.edit(m2, { role: "assistant", content: "hey!" });
      expect(chat.messages).toEqual([
        { role: "user", content: "hello" },
        { role: "assistant", content: "hey!" },
      ]);
    });

    it("throws on invalid messageId", () => {
      const chat = new ChatHistory<Msg>();
      expect(() =>
        chat.edit("nonexistent", { role: "user", content: "" }),
      ).toThrow("does not exist");
    });
  });

  describe("regenerate", () => {
    it("creates alternative response", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      chat.append({ role: "user", content: "hello" });
      const m2 = chat.append({ role: "assistant", content: "response 1" });

      const m2b = chat.regenerate(m2, {
        role: "assistant",
        content: "response 2",
      });
      expect(chat.messages).toEqual([
        { role: "user", content: "hello" },
        { role: "assistant", content: "response 2" },
      ]);
      expect(m2b).not.toBe(m2);
    });
  });

  describe("messages getter", () => {
    it("returns empty array for empty history", () => {
      const chat = new ChatHistory<Msg>();
      expect(chat.messages).toEqual([]);
    });

    it("returns current active path", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      chat.append({ role: "user", content: "a" });
      chat.append({ role: "assistant", content: "b" });
      chat.append({ role: "user", content: "c" });
      expect(chat.messages.map((m) => m.content)).toEqual(["a", "b", "c"]);
    });
  });

  describe("nodeIds getter", () => {
    it("returns node IDs matching messages", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      const m1 = chat.append({ role: "user", content: "a" });
      const m2 = chat.append({ role: "assistant", content: "b" });
      expect(chat.nodeIds).toEqual([m1, m2]);
    });
  });

  describe("isEmpty / size", () => {
    it("isEmpty is true for new history", () => {
      const chat = new ChatHistory<Msg>();
      expect(chat.isEmpty).toBe(true);
      expect(chat.size).toBe(0);
    });

    it("tracks size across branches", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      const m1 = chat.append({ role: "user", content: "hello" });
      chat.append({ role: "assistant", content: "a" });
      chat.regenerate(chat.nodeIds[1], { role: "assistant", content: "b" });
      expect(chat.size).toBe(3); // root + 2 alternatives
      expect(chat.isEmpty).toBe(false);
    });
  });

  describe("alternative navigation", () => {
    it("hasAlternatives returns false for single child", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      chat.append({ role: "user", content: "hello" });
      const m2 = chat.append({ role: "assistant", content: "hi" });
      expect(chat.hasAlternatives(m2)).toBe(false);
    });

    it("hasAlternatives returns true after regenerate", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      chat.append({ role: "user", content: "hello" });
      const m2 = chat.append({ role: "assistant", content: "response 1" });
      chat.regenerate(m2, { role: "assistant", content: "response 2" });
      // m2 now has a sibling
      expect(chat.hasAlternatives(m2)).toBe(true);
    });

    it("alternativeCount and alternativeIndex", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      chat.append({ role: "user", content: "hello" });
      const m2 = chat.append({ role: "assistant", content: "a" });
      const m2b = chat.regenerate(m2, { role: "assistant", content: "b" });
      const m2c = chat.regenerate(m2, { role: "assistant", content: "c" });

      expect(chat.alternativeCount(m2)).toBe(3);
      expect(chat.alternativeIndex(m2)).toBe(0);
      expect(chat.alternativeIndex(m2b)).toBe(1);
      expect(chat.alternativeIndex(m2c)).toBe(2);
    });

    it("nextAlternative switches branch", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      chat.append({ role: "user", content: "hello" });
      const m2 = chat.append({ role: "assistant", content: "response 1" });
      chat.regenerate(m2, { role: "assistant", content: "response 2" });

      // Currently on response 2 (regenerate set it active)
      // Navigate back to response 1
      chat.prevAlternative(chat.nodeIds[1]);
      expect(chat.messages[1].content).toBe("response 1");

      // Navigate forward to response 2
      chat.nextAlternative(chat.nodeIds[1]);
      expect(chat.messages[1].content).toBe("response 2");
    });

    it("prevAlternative switches branch", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      chat.append({ role: "user", content: "hello" });
      const m2 = chat.append({ role: "assistant", content: "a" });
      const m2b = chat.regenerate(m2, { role: "assistant", content: "b" });

      // Currently on 'b' (active after regenerate)
      chat.prevAlternative(m2b);
      expect(chat.messages[1].content).toBe("a");
    });
  });

  describe("serialization", () => {
    it("toJSON() produces valid JSON string", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      chat.append({ role: "user", content: "hello" });
      chat.append({ role: "assistant", content: "hi" });

      const json = chat.toJSON();
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("fromJSON() reconstructs identical history", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      chat.append({ role: "user", content: "hello" });
      chat.append({ role: "assistant", content: "hi" });

      const json = chat.toJSON();
      const restored = ChatHistory.fromJSON<Msg>(json);

      expect(restored.messages).toEqual(chat.messages);
      expect(restored.size).toBe(chat.size);
    });

    it("round-trip preserves branches and active state", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      chat.append({ role: "user", content: "hello" });
      const m2 = chat.append({ role: "assistant", content: "response 1" });
      chat.regenerate(m2, { role: "assistant", content: "response 2" });

      const restored = ChatHistory.fromJSON<Msg>(chat.toJSON());
      expect(restored.messages).toEqual(chat.messages);
      expect(restored.size).toBe(3);
      expect(restored.hasAlternatives(restored.nodeIds[1])).toBe(true);
    });
  });

  describe("integration: edit → navigate → edit chain", () => {
    it("handles complex branching workflow", () => {
      const chat = new ChatHistory<Msg>(freshConfig());

      // Build initial conversation
      const m1 = chat.append({ role: "user", content: "hello" });
      const m2 = chat.append({ role: "assistant", content: "hi!" });
      const m3 = chat.append({ role: "user", content: "tell me about X" });
      const m4 = chat.append({ role: "assistant", content: "X is great" });

      expect(chat.messages.length).toBe(4);

      // Edit m3 → forks from m2
      const m3b = chat.edit(m3, { role: "user", content: "tell me about Y" });
      expect(chat.messages.length).toBe(3); // m1, m2, m3b
      expect(chat.messages[2].content).toBe("tell me about Y");

      // Add response to new branch
      chat.append({ role: "assistant", content: "Y is cool" });
      expect(chat.messages.length).toBe(4);

      // Navigate back to original branch
      chat.prevAlternative(m3b);
      expect(chat.messages.length).toBe(4);
      expect(chat.messages[2].content).toBe("tell me about X");
      expect(chat.messages[3].content).toBe("X is great");

      // Regenerate m4
      chat.regenerate(m4, { role: "assistant", content: "X is awesome" });
      expect(chat.messages[3].content).toBe("X is awesome");

      // Total nodes: m1, m2, m3, m4, m3b, m3b_response, m4b = 7
      expect(chat.size).toBe(7);
    });
  });

  describe("tree access", () => {
    it("exposes underlying tree for power operations", () => {
      const chat = new ChatHistory<Msg>(freshConfig());
      chat.append({ role: "user", content: "hello" });
      chat.append({ role: "assistant", content: "hi" });

      expect(chat.tree).toBeDefined();
      expect(chat.tree.size).toBe(2);
      expect(chat.tree.getLeaves().length).toBe(1);
    });
  });
});
