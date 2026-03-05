import { ChatHistory } from "./chat-history";
import type { TreeConfig } from "./message-tree";

/**
 * Configuration for creating a Project.
 */
export interface ProjectConfig {
  /** Project name. */
  name: string;
  /** System prompt / project-wide instructions. */
  instructions?: string;
  /** Context snippets (text-based knowledge). */
  knowledge?: string[];
  /** Default model key for conversations in this project. */
  model?: string;
  /** Arbitrary metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * A conversation within a project.
 */
export interface ProjectConversation<M> {
  id: string;
  title: string;
  history: ChatHistory<M>;
  createdAt: number;
}

/**
 * Serialized form of a project, suitable for JSON persistence.
 */
export interface SerializedProject {
  version: 1;
  name: string;
  instructions: string;
  knowledge: string[];
  model: string | undefined;
  metadata: Record<string, unknown>;
  conversations: Array<{
    id: string;
    title: string;
    createdAt: number;
    history: string;
  }>;
}

/**
 * Claude-like project context manager.
 *
 * Manages a set of conversations that share a common system prompt
 * (instructions) and knowledge context. Each conversation has its own
 * {@link ChatHistory} for branching message history.
 *
 * @example
 * ```ts
 * const project = new Project({
 *   name: 'My App',
 *   instructions: 'You are a helpful coding assistant.',
 *   knowledge: ['The app uses React and TypeScript.'],
 * });
 *
 * const { id, history } = project.createConversation('First chat');
 * history.append({ role: 'user', content: 'Hello!' });
 *
 * // System prompt includes instructions + knowledge
 * project.buildSystemPrompt();
 * ```
 */
export class Project<M = unknown> {
  name: string;
  instructions: string;
  knowledge: string[];
  model: string | undefined;
  metadata: Record<string, unknown>;

  readonly conversations: Map<string, ProjectConversation<M>> = new Map();

  private _generateId: () => string;
  private _treeConfig: TreeConfig | undefined;

  constructor(config: ProjectConfig, treeConfig?: TreeConfig) {
    this.name = config.name;
    this.instructions = config.instructions ?? "";
    this.knowledge = [...(config.knowledge ?? [])];
    this.model = config.model;
    this.metadata = { ...(config.metadata ?? {}) };
    this._treeConfig = treeConfig;
    this._generateId = treeConfig?.generateId ?? (() => crypto.randomUUID());
  }

  // ─── Conversation Management ────────────────────────────

  /** Create a new conversation within this project. */
  createConversation(title?: string): ProjectConversation<M> {
    const id = this._generateId();
    const conv: ProjectConversation<M> = {
      id,
      title: title ?? `Conversation ${this.conversations.size + 1}`,
      history: new ChatHistory<M>(this._treeConfig),
      createdAt: Date.now(),
    };
    this.conversations.set(id, conv);
    return conv;
  }

  /** Get a conversation by ID. */
  getConversation(id: string): ProjectConversation<M> | undefined {
    return this.conversations.get(id);
  }

  /** List all conversations with summary info. */
  listConversations(): Array<{
    id: string;
    title: string;
    createdAt: number;
    messageCount: number;
  }> {
    const result: Array<{
      id: string;
      title: string;
      createdAt: number;
      messageCount: number;
    }> = [];
    for (const conv of this.conversations.values()) {
      result.push({
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt,
        messageCount: conv.history.size,
      });
    }
    return result;
  }

  /** Delete a conversation by ID. */
  deleteConversation(id: string): boolean {
    return this.conversations.delete(id);
  }

  // ─── System Prompt Assembly ─────────────────────────────

  /** Build the full system prompt: instructions + knowledge context. */
  buildSystemPrompt(): string {
    const parts: string[] = [];

    if (this.instructions) {
      parts.push(this.instructions);
    }

    if (this.knowledge.length > 0) {
      parts.push("");
      parts.push("## Project Knowledge");
      for (const item of this.knowledge) {
        parts.push("");
        parts.push(item);
      }
    }

    return parts.join("\n");
  }

  // ─── Knowledge Management ──────────────────────────────

  /** Add a knowledge snippet. */
  addKnowledge(text: string): void {
    this.knowledge.push(text);
  }

  /** Remove a knowledge snippet by index. */
  removeKnowledge(index: number): void {
    if (index >= 0 && index < this.knowledge.length) {
      this.knowledge.splice(index, 1);
    }
  }

  // ─── Serialization ─────────────────────────────────────

  /** Serialize the project to a JSON string. */
  toJSON(): string {
    const data: SerializedProject = {
      version: 1,
      name: this.name,
      instructions: this.instructions,
      knowledge: [...this.knowledge],
      model: this.model,
      metadata: { ...this.metadata },
      conversations: [],
    };

    for (const conv of this.conversations.values()) {
      data.conversations.push({
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt,
        history: conv.history.toJSON(),
      });
    }

    return JSON.stringify(data);
  }

  /** Restore a Project from a JSON string. */
  static fromJSON<M>(json: string, treeConfig?: TreeConfig): Project<M> {
    const data: SerializedProject = JSON.parse(json);
    if (data.version !== 1) {
      throw new Error(`Project: unsupported version ${data.version}`);
    }

    const project = new Project<M>(
      {
        name: data.name,
        instructions: data.instructions,
        knowledge: data.knowledge,
        model: data.model,
        metadata: data.metadata,
      },
      treeConfig,
    );

    for (const conv of data.conversations) {
      const history = ChatHistory.fromJSON<M>(conv.history, treeConfig);
      project.conversations.set(conv.id, {
        id: conv.id,
        title: conv.title,
        history,
        createdAt: conv.createdAt,
      });
    }

    return project;
  }
}
