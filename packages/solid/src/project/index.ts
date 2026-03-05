import { createSignal, createMemo, type Accessor } from "solid-js";
import {
  Project as CoreProject,
  type ProjectConfig,
  type ProjectConversation,
  type TreeConfig,
} from "@aibind/core";
import { ChatHistory } from "../history/chat-history.js";

export type { ProjectConfig, ProjectConversation } from "@aibind/core";

/**
 * SolidJS reactive wrapper around {@link CoreProject}.
 *
 * Derived state is exposed as `Accessor` functions that update
 * when mutations occur.
 *
 * @example
 * ```tsx
 * const project = new Project({ name: 'My App', instructions: 'Be helpful.' });
 *
 * function ProjectView() {
 *   return (
 *     <div>
 *       <p>{project.systemPrompt()}</p>
 *       <p>{project.conversationList().length} conversations</p>
 *     </div>
 *   );
 * }
 * ```
 */
export class Project<M = unknown> {
  readonly inner: CoreProject<M>;

  private _getVersion: Accessor<number>;
  private _setVersion: (v: number | ((prev: number) => number)) => void;
  private _treeConfig: TreeConfig | undefined;

  readonly name: Accessor<string>;
  readonly instructions: Accessor<string>;
  readonly knowledge: Accessor<string[]>;
  readonly model: Accessor<string | undefined>;
  readonly conversationList: Accessor<
    Array<{
      id: string;
      title: string;
      createdAt: number;
      messageCount: number;
    }>
  >;
  readonly systemPrompt: Accessor<string>;

  constructor(config: ProjectConfig, treeConfig?: TreeConfig) {
    this.inner = new CoreProject<M>(config, treeConfig);
    this._treeConfig = treeConfig;

    const [getVersion, setVersion] = createSignal(0);
    this._getVersion = getVersion;
    this._setVersion = setVersion;

    this.name = createMemo(() => {
      getVersion();
      return this.inner.name;
    });
    this.instructions = createMemo(() => {
      getVersion();
      return this.inner.instructions;
    });
    this.knowledge = createMemo(() => {
      getVersion();
      return this.inner.knowledge;
    });
    this.model = createMemo(() => {
      getVersion();
      return this.inner.model;
    });
    this.conversationList = createMemo(() => {
      getVersion();
      return this.inner.listConversations();
    });
    this.systemPrompt = createMemo(() => {
      getVersion();
      return this.inner.buildSystemPrompt();
    });
  }

  createConversation(title?: string): {
    id: string;
    title: string;
    history: ChatHistory<M>;
  } {
    const conv = this.inner.createConversation(title);
    this._setVersion((v) => v + 1);
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
    if (result) this._setVersion((v) => v + 1);
    return result;
  }

  addKnowledge(text: string): void {
    this.inner.addKnowledge(text);
    this._setVersion((v) => v + 1);
  }

  removeKnowledge(index: number): void {
    this.inner.removeKnowledge(index);
    this._setVersion((v) => v + 1);
  }

  setInstructions(instructions: string): void {
    this.inner.instructions = instructions;
    this._setVersion((v) => v + 1);
  }

  setName(name: string): void {
    this.inner.name = name;
    this._setVersion((v) => v + 1);
  }

  setModel(model: string | undefined): void {
    this.inner.model = model;
    this._setVersion((v) => v + 1);
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
    instance._setVersion((v) => v + 1);
    return instance;
  }
}
