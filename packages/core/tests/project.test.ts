import { describe, it, expect } from "vitest";
import { Project } from "../src/project.js";

let idCounter = 0;
const config = { generateId: () => `id-${++idCounter}` };

describe("Project", () => {
  it("creates with config", () => {
    const project = new Project({
      name: "Test",
      instructions: "Be helpful",
      knowledge: ["Uses TypeScript"],
      model: "gpt-4",
    });

    expect(project.name).toBe("Test");
    expect(project.instructions).toBe("Be helpful");
    expect(project.knowledge).toEqual(["Uses TypeScript"]);
    expect(project.model).toBe("gpt-4");
  });

  it("builds system prompt from instructions + knowledge", () => {
    const project = new Project({
      name: "Test",
      instructions: "You are a coding assistant.",
      knowledge: ["The app uses React.", "The backend is Node.js."],
    });

    const prompt = project.buildSystemPrompt();
    expect(prompt).toContain("You are a coding assistant.");
    expect(prompt).toContain("## Project Knowledge");
    expect(prompt).toContain("The app uses React.");
    expect(prompt).toContain("The backend is Node.js.");
  });

  it("builds system prompt with instructions only", () => {
    const project = new Project({
      name: "Test",
      instructions: "Be brief.",
    });

    expect(project.buildSystemPrompt()).toBe("Be brief.");
  });

  it("creates and lists conversations", () => {
    idCounter = 0;
    const project = new Project({ name: "Test" }, config);

    const conv1 = project.createConversation("Chat 1");
    const conv2 = project.createConversation("Chat 2");

    expect(conv1.id).toBe("id-1");
    expect(conv2.id).toBe("id-2");

    const list = project.listConversations();
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe("Chat 1");
    expect(list[1].title).toBe("Chat 2");
  });

  it("gets conversation by id", () => {
    idCounter = 0;
    const project = new Project({ name: "Test" }, config);
    const conv = project.createConversation("My Chat");

    const found = project.getConversation(conv.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe("My Chat");

    expect(project.getConversation("nonexistent")).toBeUndefined();
  });

  it("deletes conversation", () => {
    idCounter = 0;
    const project = new Project({ name: "Test" }, config);
    const conv = project.createConversation("To Delete");

    expect(project.deleteConversation(conv.id)).toBe(true);
    expect(project.listConversations()).toHaveLength(0);
    expect(project.deleteConversation("nonexistent")).toBe(false);
  });

  it("manages knowledge", () => {
    const project = new Project({ name: "Test" });

    project.addKnowledge("Fact 1");
    project.addKnowledge("Fact 2");
    expect(project.knowledge).toEqual(["Fact 1", "Fact 2"]);

    project.removeKnowledge(0);
    expect(project.knowledge).toEqual(["Fact 2"]);

    // Out of bounds does nothing
    project.removeKnowledge(99);
    expect(project.knowledge).toEqual(["Fact 2"]);
  });

  it("conversations have working history", () => {
    idCounter = 0;
    const project = new Project<{ role: string; content: string }>(
      { name: "Test" },
      config,
    );
    const conv = project.createConversation();

    conv.history.append({ role: "user", content: "Hello" });
    conv.history.append({ role: "assistant", content: "Hi!" });

    expect(conv.history.messages).toHaveLength(2);
    expect(conv.history.messages[0].content).toBe("Hello");
  });

  it("serializes and deserializes", () => {
    idCounter = 0;
    const project = new Project<{ role: string; content: string }>(
      {
        name: "My Project",
        instructions: "Be helpful",
        knowledge: ["Fact 1"],
        model: "gpt-4",
        metadata: { version: 1 },
      },
      config,
    );

    const conv = project.createConversation("Chat 1");
    conv.history.append({ role: "user", content: "Hello" });

    const json = project.toJSON();
    idCounter = 100; // Different counter to prove deserialization works

    const restored = Project.fromJSON<{ role: string; content: string }>(
      json,
      config,
    );

    expect(restored.name).toBe("My Project");
    expect(restored.instructions).toBe("Be helpful");
    expect(restored.knowledge).toEqual(["Fact 1"]);
    expect(restored.model).toBe("gpt-4");
    expect(restored.metadata).toEqual({ version: 1 });

    const restoredConv = restored.getConversation(conv.id);
    expect(restoredConv).toBeDefined();
    expect(restoredConv!.title).toBe("Chat 1");
    expect(restoredConv!.history.messages).toHaveLength(1);
    expect(restoredConv!.history.messages[0].content).toBe("Hello");
  });
});
