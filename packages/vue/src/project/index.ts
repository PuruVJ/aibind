import { ref, computed, type ComputedRef } from "vue";
import {
  Project as CoreProject,
  type ProjectConfig,
  type ProjectConversation,
  type TreeConfig,
} from "@aibind/core";
import { ChatHistory } from "../history/chat-history.js";

export type { ProjectConfig, ProjectConversation } from "@aibind/core";

/**
 * Vue reactive wrapper around {@link CoreProject}.
 *
 * Derived state is exposed as `ComputedRef` properties that update
 * when mutations occur.
 *
 * @example
 * ```vue
 * <script setup>
 * const project = new Project({ name: 'My App', instructions: 'Be helpful.' });
 * </script>
 * <template>
 *   <p>{{ project.systemPrompt.value }}</p>
 *   <p>{{ project.conversationList.value.length }} conversations</p>
 * </template>
 * ```
 */
export class Project<M = unknown> {
  readonly inner: CoreProject<M>;

  private _version = ref(0);
  private _treeConfig: TreeConfig | undefined;

  readonly name: ComputedRef<string>;
  readonly instructions: ComputedRef<string>;
  readonly knowledge: ComputedRef<string[]>;
  readonly model: ComputedRef<string | undefined>;
  readonly conversationList: ComputedRef<
    Array<{
      id: string;
      title: string;
      createdAt: number;
      messageCount: number;
    }>
  >;
  readonly systemPrompt: ComputedRef<string>;

  constructor(config: ProjectConfig, treeConfig?: TreeConfig) {
    this.inner = new CoreProject<M>(config, treeConfig);
    this._treeConfig = treeConfig;

    this.name = computed(() => {
      this._version.value;
      return this.inner.name;
    });
    this.instructions = computed(() => {
      this._version.value;
      return this.inner.instructions;
    });
    this.knowledge = computed(() => {
      this._version.value;
      return this.inner.knowledge;
    });
    this.model = computed(() => {
      this._version.value;
      return this.inner.model;
    });
    this.conversationList = computed(() => {
      this._version.value;
      return this.inner.listConversations();
    });
    this.systemPrompt = computed(() => {
      this._version.value;
      return this.inner.buildSystemPrompt();
    });
  }

  createConversation(title?: string): {
    id: string;
    title: string;
    history: ChatHistory<M>;
  } {
    const conv = this.inner.createConversation(title);
    this._version.value++;
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
    if (result) this._version.value++;
    return result;
  }

  addKnowledge(text: string): void {
    this.inner.addKnowledge(text);
    this._version.value++;
  }

  removeKnowledge(index: number): void {
    this.inner.removeKnowledge(index);
    this._version.value++;
  }

  setInstructions(instructions: string): void {
    this.inner.instructions = instructions;
    this._version.value++;
  }

  setName(name: string): void {
    this.inner.name = name;
    this._version.value++;
  }

  setModel(model: string | undefined): void {
    this.inner.model = model;
    this._version.value++;
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
    instance._version.value++;
    return instance;
  }
}
