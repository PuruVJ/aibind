import { useState, useEffect, useRef, useMemo } from "react";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  ChatController,
  StreamController,
  StreamBroadcastReceiver,
  StructuredStreamController,
  CompletionController,
  RaceController,
  UsageTracker,
  type Artifact,
  type BaseChatOptions,
  type BroadcastMessage,
  type ChatCallbacks,
  type ChatMessage,
  type ChatSendOptions,
  type StagedMessage,
  type StreamCallbacks,
  type StreamControllerOptions,
  type StructuredStreamCallbacks,
  type StructuredStreamControllerOptions,
  type RaceCallbacks,
  type RaceControllerOptions,
  type RaceStrategy,
  type StreamStatus,
  type StreamUsage,
  type SendOptions,
  type DeepPartial,
  type BaseStreamOptions,
  type BaseCompletionOptions,
  type CompletionCallbacks,
  ChatHistory as CoreChatHistory,
  Project as CoreProject,
  type ConversationMessage,
  type TreeConfig,
  type ProjectConfig,
  type ProjectConversation,
  type TurnUsage,
  type UsageTrackerOptions,
  type DiffChunk,
} from "@aibind/core";

export { defineModels, fileToAttachment, defaultDiff } from "@aibind/core";
export type {
  Artifact,
  ArtifactDetector,
  ArtifactLineResult,
  SendOptions,
  DeepPartial,
  LanguageModel,
  StreamStatus,
  StreamUsage,
  BaseStreamOptions,
  BaseCompletionOptions,
  UsageRecorder,
  ModelPricing,
  TurnUsage,
  UsageTrackerOptions,
  DiffChunk,
  DiffFn,
  RaceStrategy,
  Attachment,
  ChatMessage,
  ChatSendOptions,
  StagedMessage,
  TreeConfig,
  ProjectConfig,
  ProjectConversation,
} from "@aibind/core";

// --- useStreamMirror ---

export interface UseStreamMirrorReturn {
  text: string;
  status: StreamStatus;
  loading: boolean;
  done: boolean;
  error: string | null;
}

/**
 * React hook for reading a stream broadcasted by another tab/window.
 * Makes no HTTP request — listens on a BroadcastChannel opened by `stream.broadcast()`.
 *
 * @example
 * ```tsx
 * const mirror = useStreamMirror("my-chat-session");
 * return <p>{mirror.text}</p>;
 * ```
 */
export function useStreamMirror(channelName: string): UseStreamMirrorReturn {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const receiver = new StreamBroadcastReceiver(
      channelName,
      (msg: BroadcastMessage) => {
        setText(msg.text);
        setStatus(msg.status);
        setLoading(msg.loading);
        setDone(msg.done);
        setError(msg.error);
      },
    );
    return () => receiver.destroy();
  }, [channelName]);

  return { text, status, loading, done, error };
}

// --- useUsageTracker ---

export interface UseUsageTrackerReturn {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  turns: number;
  history: TurnUsage[];
  tracker: UsageTracker;
  reset: () => void;
}

/**
 * React hook for accumulating token usage and cost across stream turns.
 *
 * @example
 * ```tsx
 * const { tracker, inputTokens, cost } = useUsageTracker({
 *   pricing: { fast: { inputPerMillion: 0.15, outputPerMillion: 0.60 } },
 * });
 * const { send } = useStream({ model: "fast", tracker });
 * ```
 */
export function useUsageTracker(
  options: UsageTrackerOptions = {},
): UseUsageTrackerReturn {
  const [inputTokens, setInputTokens] = useState(0);
  const [outputTokens, setOutputTokens] = useState(0);
  const [cost, setCost] = useState(0);
  const [turns, setTurns] = useState(0);
  const [history, setHistory] = useState<TurnUsage[]>([]);

  const trackerRef = useRef<UsageTracker | null>(null);
  if (!trackerRef.current) {
    trackerRef.current = new UsageTracker({
      ...options,
      onUpdate: () => {
        const t = trackerRef.current!;
        setInputTokens(t.inputTokens);
        setOutputTokens(t.outputTokens);
        setCost(t.cost);
        setTurns(t.turns);
        setHistory([...t.history]);
        options.onUpdate?.();
      },
    });
  }

  return {
    inputTokens,
    outputTokens,
    cost,
    turns,
    history,
    tracker: trackerRef.current,
    reset: () => trackerRef.current!.reset(),
  };
}

// --- useCompletion ---

export interface CompletionOptions extends BaseCompletionOptions {}

export interface UseCompletionReturn {
  suggestion: string;
  loading: boolean;
  error: Error | null;
  update: (input: string) => void;
  accept: () => string;
  clear: () => void;
  abort: () => void;
}

/**
 * React hook for inline completions with debouncing and ghost-text state.
 */
export function useCompletion(
  options: CompletionOptions = {},
): UseCompletionReturn {
  const [suggestion, setSuggestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const ctrlRef = useRef<CompletionController | null>(null);

  if (!ctrlRef.current) {
    ctrlRef.current = new CompletionController(options, {
      onSuggestion: setSuggestion,
      onLoading: setLoading,
      onError: setError,
    } satisfies CompletionCallbacks);
  }

  useEffect(() => () => ctrlRef.current?.abort(), []);

  return {
    suggestion,
    loading,
    error,
    update: (input) => ctrlRef.current!.update(input),
    accept: () => ctrlRef.current!.accept(),
    clear: () => ctrlRef.current!.clear(),
    abort: () => ctrlRef.current!.abort(),
  };
}

// --- useStream ---

export interface UseStreamReturn<M extends string = string> {
  text: string;
  loading: boolean;
  error: Error | null;
  done: boolean;
  status: StreamStatus;
  streamId: string | null;
  canResume: boolean;
  model: M | undefined;
  setModel: (model: M) => void;
  usage: StreamUsage | null;
  diff: DiffChunk[] | null;
  artifacts: Artifact[];
  activeArtifact: Artifact | null;
  send: (prompt: string, sendOpts?: { system?: string; model?: M }) => void;
  abort: () => void;
  retry: () => void;
  stop: () => Promise<void>;
  resume: () => Promise<void>;
  compact: (
    chat: CoreChatHistory<ConversationMessage>,
  ) => Promise<{ tokensSaved: number }>;
  broadcast: (channelName: string) => () => void;
}

export interface StreamOptions<
  M extends string = string,
> extends BaseStreamOptions {
  model?: M;
  routeModel?: (prompt: string) => M | Promise<M>;
}

/**
 * React hook for streaming text from an AI endpoint.
 *
 * @example
 * ```tsx
 * const { text, loading, send } = useStream({ endpoint: '/api/stream' });
 * ```
 */
export function useStream<M extends string = string>(
  options: StreamOptions<M>,
): UseStreamReturn<M> {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [streamId, setStreamId] = useState<string | null>(null);
  const [canResume, setCanResume] = useState(false);
  const [model, _setModel] = useState<M | undefined>(
    options.model as M | undefined,
  );
  const [usage, setUsage] = useState<StreamUsage | null>(null);
  const [diff, setDiff] = useState<DiffChunk[] | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  const ctrlRef = useRef<StreamController | null>(null);

  if (!ctrlRef.current) {
    ctrlRef.current = new StreamController(options as StreamControllerOptions, {
      onText: setText,
      onLoading: setLoading,
      onDone: setDone,
      onError: setError,
      onStatus: setStatus,
      onStreamId: setStreamId,
      onCanResume: setCanResume,
      onUsage: setUsage,
      onDiff: setDiff,
      onArtifacts: setArtifacts,
    } satisfies StreamCallbacks);
  }

  useEffect(() => () => ctrlRef.current?.abort(), []);

  const activeArtifact = useMemo(
    () => artifacts.findLast((a) => !a.complete) ?? null,
    [artifacts],
  );

  return {
    text,
    loading,
    error,
    done,
    status,
    streamId,
    canResume,
    model,
    usage,
    diff,
    artifacts,
    activeArtifact,
    setModel: (value: M) => {
      _setModel(value);
      ctrlRef.current!.setModel(value);
    },
    send: (prompt: string, sendOpts?: { system?: string; model?: M }) =>
      ctrlRef.current!.send(prompt, sendOpts),
    abort: () => ctrlRef.current!.abort(),
    retry: () => ctrlRef.current!.retry(),
    stop: () => ctrlRef.current!.stop(),
    resume: () => ctrlRef.current!.resume(),
    compact: (chat) => ctrlRef.current!.compact(chat),
    broadcast: (channelName) => ctrlRef.current!.broadcast(channelName),
  };
}

// --- useStructuredStream ---

export interface UseStructuredStreamReturn<T> {
  data: T | null;
  partial: DeepPartial<T> | null;
  raw: string;
  loading: boolean;
  error: Error | null;
  done: boolean;
  send: (prompt: string, sendOpts?: SendOptions) => void;
  abort: () => void;
  retry: () => void;
}

export interface StructuredStreamOptions<T, M extends string = string> {
  model?: M;
  schema: StandardSchemaV1<unknown, T>;
  system?: string;
  endpoint: string;
  fetch?: typeof globalThis.fetch;
  onFinish?: (data: T) => void;
  onError?: (error: Error) => void;
}

/**
 * React hook for streaming structured (JSON) output with partial updates.
 *
 * @example
 * ```tsx
 * const { data, partial, send } = useStructuredStream({
 *   endpoint: '/api/structured',
 *   schema: mySchema,
 * });
 * ```
 */
export function useStructuredStream<M extends string, T>(
  opts: StructuredStreamOptions<T, M>,
): UseStructuredStreamReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [partial, setPartial] = useState<DeepPartial<T> | null>(null);
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [done, setDone] = useState(false);

  const ctrlRef = useRef<StructuredStreamController<T> | null>(null);

  if (!ctrlRef.current) {
    ctrlRef.current = new StructuredStreamController<T>(
      opts as unknown as StructuredStreamControllerOptions<T>,
      {
        onText: setRaw,
        onLoading: setLoading,
        onDone: setDone,
        onError: setError,
        onStatus: () => {},
        onStreamId: () => {},
        onCanResume: () => {},
        onPartial: (p) => setPartial(p as DeepPartial<T> | null),
        onData: setData,
      } satisfies StructuredStreamCallbacks<T>,
    );
  }

  useEffect(() => () => ctrlRef.current?.abort(), []);

  return {
    data,
    partial,
    raw,
    loading,
    error,
    done,
    send: (prompt: string, sendOpts?: SendOptions) =>
      ctrlRef.current!.send(prompt, sendOpts),
    abort: () => ctrlRef.current!.abort(),
    retry: () => ctrlRef.current!.retry(),
  };
}

// --- useRace ---

export interface RaceOptions<M extends string = string> {
  models: M[];
  endpoint: string;
  system?: string;
  strategy?: RaceStrategy;
  fetch?: typeof globalThis.fetch;
  onFinish?: (text: string, winner: M) => void;
  onError?: (error: Error) => void;
}

export interface UseRaceReturn<M extends string = string> {
  text: string;
  loading: boolean;
  error: Error | null;
  done: boolean;
  winner: M | null;
  send: (prompt: string, options?: { system?: string }) => void;
  abort: () => void;
}

/**
 * React hook for multi-model racing.
 * Sends the same prompt to all models simultaneously; the winner updates state.
 */
export function useRace<M extends string = string>(
  opts: RaceOptions<M>,
): UseRaceReturn<M> {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [done, setDone] = useState(false);
  const [winner, setWinner] = useState<M | null>(null);

  const ctrlRef = useRef<RaceController | null>(null);

  if (!ctrlRef.current) {
    ctrlRef.current = new RaceController(opts as RaceControllerOptions, {
      onText: setText,
      onLoading: setLoading,
      onDone: setDone,
      onError: setError,
      onWinner: (w) => setWinner(w as M | null),
    } satisfies RaceCallbacks);
  }

  useEffect(() => () => ctrlRef.current?.abort(), []);

  return {
    text,
    loading,
    error,
    done,
    winner,
    send: (prompt, options) => ctrlRef.current!.send(prompt, options),
    abort: () => ctrlRef.current!.abort(),
  };
}

// --- useChat ---

export interface ChatOptions extends BaseChatOptions {}

export interface UseChatReturn {
  messages: ChatMessage[];
  loading: boolean;
  error: Error | null;
  status: StreamStatus;
  hasOptimistic: boolean;
  title: string | null;
  titleLoading: boolean;
  send: (content: string, opts?: ChatSendOptions) => void;
  abort: () => void;
  clear: () => void;
  regenerate: () => void;
  edit: (id: string, text: string, opts?: ChatSendOptions) => void;
  revert: () => string | null;
  optimistic: (content: string, opts?: ChatSendOptions) => StagedMessage;
  generateTitle: (opts?: { model?: string }) => Promise<void>;
}

/**
 * React hook for multi-turn AI chat.
 * Manages the messages[] array, streams assistant replies chunk-by-chunk,
 * and provides helpers for regenerate and edit-and-resend flows.
 *
 * @example
 * ```tsx
 * const { messages, send, loading } = useChat({ endpoint: '/api/chat' });
 * ```
 */
export function useChat(options: ChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [title, setTitle] = useState<string | null>(null);
  const [titleLoading, setTitleLoading] = useState(false);

  const ctrlRef = useRef<ChatController | null>(null);
  if (!ctrlRef.current) {
    ctrlRef.current = new ChatController(options, {
      onMessages: setMessages,
      onLoading: setLoading,
      onError: setError,
      onStatus: setStatus,
      onTitle: setTitle,
      onTitleLoading: setTitleLoading,
    } satisfies ChatCallbacks);
  }

  useEffect(() => () => ctrlRef.current?.abort(), []);

  return {
    messages,
    loading,
    error,
    status,
    hasOptimistic: messages.some((m) => m.optimistic),
    title,
    titleLoading,
    send: (content, opts) => ctrlRef.current!.send(content, opts),
    abort: () => ctrlRef.current!.abort(),
    clear: () => ctrlRef.current!.clear(),
    regenerate: () => ctrlRef.current!.regenerate(),
    edit: (id, text, opts) => ctrlRef.current!.edit(id, text, opts),
    revert: () => ctrlRef.current!.revert(),
    optimistic: (content, opts) => ctrlRef.current!.optimistic(content, opts),
    generateTitle: (opts) => ctrlRef.current!.generateTitle(opts),
  };
}

// --- useChatHistory ---

export interface UseChatHistoryReturn<M> {
  messages: M[];
  nodeIds: string[];
  isEmpty: boolean;
  size: number;
  history: CoreChatHistory<M>;
  append: (message: M) => string;
  edit: (messageId: string, newMessage: M) => string;
  regenerate: (messageId: string, newResponse: M) => string;
  hasAlternatives: (nodeId: string) => boolean;
  alternativeCount: (nodeId: string) => number;
  alternativeIndex: (nodeId: string) => number;
  nextAlternative: (nodeId: string) => void;
  prevAlternative: (nodeId: string) => void;
  compact: (summary: M) => void;
  toJSON: () => string;
}

/**
 * React hook for branching conversation history.
 * All mutating operations trigger a re-render automatically.
 *
 * @example
 * ```tsx
 * const { messages, nodeIds, append, edit, nextAlternative } = useChatHistory<MyMsg>();
 * ```
 */
export function useChatHistory<M>(
  config?: TreeConfig,
): UseChatHistoryReturn<M> {
  const [, setTick] = useState(0);
  const histRef = useRef<CoreChatHistory<M> | null>(null);
  if (!histRef.current) histRef.current = new CoreChatHistory<M>(config);
  const hist = histRef.current;
  const update = (): void => setTick((t) => t + 1);

  return {
    messages: hist.messages,
    nodeIds: hist.nodeIds,
    isEmpty: hist.isEmpty,
    size: hist.size,
    history: hist,
    append: (message) => {
      const id = hist.append(message);
      update();
      return id;
    },
    edit: (messageId, newMessage) => {
      const id = hist.edit(messageId, newMessage);
      update();
      return id;
    },
    regenerate: (messageId, newResponse) => {
      const id = hist.regenerate(messageId, newResponse);
      update();
      return id;
    },
    hasAlternatives: (nodeId) => hist.hasAlternatives(nodeId),
    alternativeCount: (nodeId) => hist.alternativeCount(nodeId),
    alternativeIndex: (nodeId) => hist.alternativeIndex(nodeId),
    nextAlternative: (nodeId) => {
      hist.nextAlternative(nodeId);
      update();
    },
    prevAlternative: (nodeId) => {
      hist.prevAlternative(nodeId);
      update();
    },
    compact: (summary) => {
      hist.compact(summary);
      update();
    },
    toJSON: () => hist.toJSON(),
  };
}

// --- useProject ---

export interface UseProjectReturn<M> {
  name: string;
  instructions: string;
  knowledge: string[];
  model: string | undefined;
  conversationList: Array<{
    id: string;
    title: string;
    createdAt: number;
    messageCount: number;
  }>;
  systemPrompt: string;
  project: CoreProject<M>;
  createConversation: (title?: string) => ProjectConversation<M>;
  getConversation: (id: string) => ProjectConversation<M> | undefined;
  deleteConversation: (id: string) => boolean;
  addKnowledge: (text: string) => void;
  removeKnowledge: (index: number) => void;
  setName: (name: string) => void;
  setInstructions: (instructions: string) => void;
  setModel: (model: string | undefined) => void;
  buildSystemPrompt: () => string;
  toJSON: () => string;
}

/**
 * React hook for project-scoped context management.
 * Manages multiple conversations sharing instructions and knowledge snippets.
 *
 * @example
 * ```tsx
 * const { systemPrompt, createConversation, addKnowledge } = useProject({ name: 'My App' });
 * ```
 */
export function useProject<M = unknown>(
  config: ProjectConfig,
): UseProjectReturn<M> {
  const [, setTick] = useState(0);
  const projRef = useRef<CoreProject<M> | null>(null);
  if (!projRef.current) projRef.current = new CoreProject<M>(config);
  const proj = projRef.current;
  const update = (): void => setTick((t) => t + 1);

  return {
    name: proj.name,
    instructions: proj.instructions,
    knowledge: proj.knowledge,
    model: proj.model,
    conversationList: proj.listConversations(),
    systemPrompt: proj.buildSystemPrompt(),
    project: proj,
    createConversation: (title) => {
      const conv = proj.createConversation(title);
      update();
      return conv;
    },
    getConversation: (id) => proj.getConversation(id),
    deleteConversation: (id) => {
      const result = proj.deleteConversation(id);
      if (result) update();
      return result;
    },
    addKnowledge: (text) => {
      proj.addKnowledge(text);
      update();
    },
    removeKnowledge: (index) => {
      proj.removeKnowledge(index);
      update();
    },
    setName: (name) => {
      proj.name = name;
      update();
    },
    setInstructions: (instructions) => {
      proj.instructions = instructions;
      update();
    },
    setModel: (model) => {
      proj.model = model;
      update();
    },
    buildSystemPrompt: () => proj.buildSystemPrompt(),
    toJSON: () => proj.toJSON(),
  };
}
