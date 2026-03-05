import { useSyncExternalStore } from "react";
import {
  Project as CoreProject,
  type ProjectConfig,
  type ProjectConversation,
  type TreeConfig,
} from "@aibind/core";
import { ChatHistory } from "../history/chat-history.js";

export type { ProjectConfig, ProjectConversation } from "@aibind/core";

/**
 * React reactive wrapper around {@link CoreProject}.
 *
 * Call `useSnapshot()` inside a component to get reactive state.
 * Mutations (create/delete conversation, add/remove knowledge) trigger re-renders.
 *
 * @example
 * ```tsx
 * const project = new Project({
 *   name: 'My App',
 *   instructions: 'You are helpful.',
 * });
 *
 * function ProjectView() {
 *   const { conversations, systemPrompt } = project.useSnapshot();
 *   return <div>{conversations.length} conversations</div>;
 * }
 * ```
 */
export class Project<M = unknown> {
  /** The underlying non-reactive Project. */
  readonly inner: CoreProject<M>;

  private _version = 0;
  private _listeners = new Set<() => void>();
  private _treeConfig: TreeConfig | undefined;

  constructor(config: ProjectConfig, treeConfig?: TreeConfig) {
    this.inner = new CoreProject<M>(config, treeConfig);
    this._treeConfig = treeConfig;
  }

  private _notify(): void {
    this._version++;
    this._listeners.forEach((l) => l());
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  readonly getSnapshot = (): number => this._version;

  // ─── React Hook ────────────────────────────────────────────

  /** React hook — call inside components to get reactive state. */
  useSnapshot(): {
    name: string;
    instructions: string;
    knowledge: string[];
    model: string | undefined;
    conversations: Array<{
      id: string;
      title: string;
      createdAt: number;
      messageCount: number;
    }>;
    systemPrompt: string;
  } {
    useSyncExternalStore(this.subscribe, this.getSnapshot);
    return {
      name: this.inner.name,
      instructions: this.inner.instructions,
      knowledge: this.inner.knowledge,
      model: this.inner.model,
      conversations: this.inner.listConversations(),
      systemPrompt: this.inner.buildSystemPrompt(),
    };
  }

  // ─── Conversation Management ────────────────────────────

  /** Create a new conversation. Returns a reactive ChatHistory. */
  createConversation(title?: string): {
    id: string;
    title: string;
    history: ChatHistory<M>;
  } {
    const conv = this.inner.createConversation(title);
    this._notify();
    // Wrap the core ChatHistory in a reactive one
    const reactiveHistory = new ChatHistory<M>(this._treeConfig);
    (reactiveHistory as { inner: typeof conv.history }).inner = conv.history;
    return { id: conv.id, title: conv.title, history: reactiveHistory };
  }

  /** Get a conversation by ID. */
  getConversation(
    id: string,
  ): { id: string; title: string; history: ChatHistory<M> } | undefined {
    const conv = this.inner.getConversation(id);
    if (!conv) return undefined;
    const reactiveHistory = new ChatHistory<M>(this._treeConfig);
    (reactiveHistory as { inner: typeof conv.history }).inner = conv.history;
    return { id: conv.id, title: conv.title, history: reactiveHistory };
  }

  /** Delete a conversation by ID. */
  deleteConversation(id: string): boolean {
    const result = this.inner.deleteConversation(id);
    if (result) this._notify();
    return result;
  }

  // ─── Knowledge Management ──────────────────────────────

  /** Add a knowledge snippet. */
  addKnowledge(text: string): void {
    this.inner.addKnowledge(text);
    this._notify();
  }

  /** Remove a knowledge snippet by index. */
  removeKnowledge(index: number): void {
    this.inner.removeKnowledge(index);
    this._notify();
  }

  // ─── Mutators ──────────────────────────────────────────

  /** Update project instructions. */
  setInstructions(instructions: string): void {
    this.inner.instructions = instructions;
    this._notify();
  }

  /** Update project name. */
  setName(name: string): void {
    this.inner.name = name;
    this._notify();
  }

  /** Update default model. */
  setModel(model: string | undefined): void {
    this.inner.model = model;
    this._notify();
  }

  // ─── Delegation ────────────────────────────────────────

  /** Build the full system prompt. */
  buildSystemPrompt(): string {
    return this.inner.buildSystemPrompt();
  }

  /** Serialize to JSON string. */
  toJSON(): string {
    return this.inner.toJSON();
  }

  /** Restore from JSON string. */
  static fromJSON<M>(json: string, treeConfig?: TreeConfig): Project<M> {
    const instance = new Project<M>({ name: "" }, treeConfig);
    const restored = CoreProject.fromJSON<M>(json, treeConfig);
    (instance as { inner: CoreProject<M> }).inner = restored;
    instance._version++;
    return instance;
  }
}
