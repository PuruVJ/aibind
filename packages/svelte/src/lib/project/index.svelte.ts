import {
  Project as CoreProject,
  type ProjectConfig,
  type ProjectConversation,
  type TreeConfig,
} from "@aibind/core";
import { ChatHistory } from "../history/chat-history.svelte.js";

export type { ProjectConfig, ProjectConversation } from "@aibind/core";

/**
 * Svelte 5 reactive wrapper around {@link CoreProject}.
 *
 * Uses `$state` and `$derived` runes for reactivity.
 *
 * @example
 * ```svelte
 * <script>
 * const project = new Project({ name: 'My App', instructions: 'Be helpful.' });
 * </script>
 *
 * <p>{project.systemPrompt}</p>
 * <p>{project.conversationList.length} conversations</p>
 * ```
 */
export class Project<M = unknown> {
  readonly inner: CoreProject<M>;
  private _treeConfig: TreeConfig | undefined;
  private _version = $state(0);

  readonly name = $derived.by(() => {
    this._version;
    return this.inner.name;
  });
  readonly instructions = $derived.by(() => {
    this._version;
    return this.inner.instructions;
  });
  readonly knowledge = $derived.by(() => {
    this._version;
    return this.inner.knowledge;
  });
  readonly model = $derived.by(() => {
    this._version;
    return this.inner.model;
  });
  readonly conversationList = $derived.by(() => {
    this._version;
    return this.inner.listConversations();
  });
  readonly systemPrompt = $derived.by(() => {
    this._version;
    return this.inner.buildSystemPrompt();
  });

  constructor(config: ProjectConfig, treeConfig?: TreeConfig) {
    this.inner = new CoreProject<M>(config, treeConfig);
    this._treeConfig = treeConfig;
  }

  createConversation(title?: string): {
    id: string;
    title: string;
    history: ChatHistory<M>;
  } {
    const conv = this.inner.createConversation(title);
    this._version++;
    const reactiveHistory = new ChatHistory<M>(this._treeConfig);
    (reactiveHistory as { inner: typeof conv.history }).inner = conv.history;
    return { id: conv.id, title: conv.title, history: reactiveHistory };
  }

  getConversation(
    id: string,
  ): { id: string; title: string; history: ChatHistory<M> } | undefined {
    const conv = this.inner.getConversation(id);
    if (!conv) return undefined;
    const reactiveHistory = new ChatHistory<M>(this._treeConfig);
    (reactiveHistory as { inner: typeof conv.history }).inner = conv.history;
    return { id: conv.id, title: conv.title, history: reactiveHistory };
  }

  deleteConversation(id: string): boolean {
    const result = this.inner.deleteConversation(id);
    if (result) this._version++;
    return result;
  }

  addKnowledge(text: string): void {
    this.inner.addKnowledge(text);
    this._version++;
  }

  removeKnowledge(index: number): void {
    this.inner.removeKnowledge(index);
    this._version++;
  }

  setInstructions(instructions: string): void {
    this.inner.instructions = instructions;
    this._version++;
  }

  setName(name: string): void {
    this.inner.name = name;
    this._version++;
  }

  setModel(model: string | undefined): void {
    this.inner.model = model;
    this._version++;
  }

  buildSystemPrompt(): string {
    return this.inner.buildSystemPrompt();
  }

  toJSON(): string {
    return this.inner.toJSON();
  }

  static fromJSON<M>(json: string, treeConfig?: TreeConfig): Project<M> {
    const instance = new Project<M>({ name: "" }, treeConfig);
    const restored = CoreProject.fromJSON<M>(json, treeConfig);
    (instance as { inner: CoreProject<M> }).inner = restored;
    instance._version++;
    return instance;
  }
}
