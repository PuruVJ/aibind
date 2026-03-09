/**
 * Text stream controller.
 *
 * Extends BaseStreamController with text accumulation, diffs, artifacts,
 * and cross-tab broadcast. Framework packages create thin wrappers that
 * wire callbacks to their reactive primitives ($state, ref, createSignal).
 */

import {
  BaseStreamController,
  type BaseStreamCallbacks,
  type BaseStreamControllerOptions,
} from "./base-stream-controller";
import type {
  StreamStatus,
  StreamUsage,
  SendOptions,
  UsageRecorder,
  DiffChunk,
  DiffFn,
} from "./types";
import type { Artifact } from "./artifacts";
import type { ChatHistory } from "./chat-history";
import type { ConversationMessage } from "./conversation-store";
import { StreamBroadcaster } from "./broadcast";

const RE_SENTENCE_END = /[.!?](?:\s|$)/;

// --- Callbacks ---

export interface StreamCallbacks extends BaseStreamCallbacks {
  onText(text: string): void;
  onDiff?(chunks: DiffChunk[] | null): void;
  onArtifacts?(artifacts: Artifact[]): void;
}

export interface StreamControllerOptions extends BaseStreamControllerOptions {
  onFinish?: (text: string) => void;
  diff?: DiffFn;
  artifact?: { detector: import("./artifacts").ArtifactDetector };
}

// Re-export for consumers who import these from stream-controller
export type {
  BaseStreamCallbacks,
  BaseStreamControllerOptions,
  StreamStatus,
  StreamUsage,
  SendOptions,
  UsageRecorder,
  DiffChunk,
  DiffFn,
  Artifact,
  ChatHistory,
  ConversationMessage,
};

// --- StreamController ---

export class StreamController extends BaseStreamController {
  declare protected _opts: StreamControllerOptions;
  declare protected _cb: StreamCallbacks;

  protected _text = "";
  private _prevText = "";
  private _scannedUpTo = 0;
  private _inArtifact = false;
  private _artifacts: Artifact[] = [];
  private _artifactIdSeq = 0;
  private _broadcaster: StreamBroadcaster | null = null;
  private _speakActive = false;
  private _speakBuffer = "";

  get text(): string {
    return this._text;
  }

  constructor(options: StreamControllerOptions, callbacks: StreamCallbacks) {
    super(options, callbacks);
    this._opts = options;
    this._cb = callbacks;
  }

  // --- Speak ---

  /**
   * Pipe the streaming response into the browser's Web Speech API.
   * Audio playback starts after the first sentence completes — no waiting for
   * the full response. Returns a cleanup function that cancels speech.
   *
   * No-op in non-browser environments (returns a no-op cleanup).
   */
  speak(): () => void {
    if (typeof speechSynthesis === "undefined") return () => {};
    speechSynthesis.cancel();
    this._speakActive = true;
    this._speakBuffer = "";
    return () => {
      this._speakActive = false;
      speechSynthesis.cancel();
    };
  }

  private _flushSpeak(final = false): void {
    if (!this._speakActive) return;
    const match = RE_SENTENCE_END.exec(this._speakBuffer);
    if (match) {
      const boundary = match.index + match[0].length;
      const sentence = this._speakBuffer.slice(0, boundary).trim();
      this._speakBuffer = this._speakBuffer.slice(boundary);
      if (sentence) speechSynthesis.speak(new SpeechSynthesisUtterance(sentence));
    } else if (final && this._speakBuffer.trim()) {
      speechSynthesis.speak(new SpeechSynthesisUtterance(this._speakBuffer.trim()));
      this._speakBuffer = "";
    }
  }

  // --- Broadcast ---

  broadcast(channelName: string): () => void {
    if (typeof BroadcastChannel === "undefined") return () => {};
    this._broadcaster?.destroy();
    this._broadcaster = new StreamBroadcaster(channelName);
    this._postBroadcast();
    return () => {
      this._broadcaster?.destroy();
      this._broadcaster = null;
    };
  }

  // --- Hook overrides ---

  protected override _processChunk(chunk: string): void {
    this._text += chunk;
    this._cb.onText(this._text);
    this._scanArtifacts();
    this._postBroadcast();
    this._speakBuffer += chunk;
    this._flushSpeak();
  }

  protected override async _finalize(): Promise<void> {
    if (this._opts.artifact && this._inArtifact && this._artifacts.length > 0) {
      this._artifacts[this._artifacts.length - 1]!.complete = true;
      this._cb.onArtifacts?.([...this._artifacts]);
    }
    this._flushSpeak(true);
    this._opts.onFinish?.(this._text);
  }

  protected override _resetState(): void {
    this._prevText = this._text;
    super._resetState();
    this._text = "";
    this._scannedUpTo = 0;
    this._inArtifact = false;
    this._artifacts = [];
    this._speakActive = false;
    this._speakBuffer = "";
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    this._cb.onText("");
    this._cb.onDiff?.(null);
    if (this._opts.artifact) this._cb.onArtifacts?.([]);
    this._postBroadcast();
  }

  protected override _postBroadcast(error?: Error): void {
    if (!this._broadcaster) return;
    this._broadcaster.post({
      text: this._text,
      status: this._status,
      loading: this._status === "streaming" || this._status === "reconnecting",
      done: this._done,
      error: error?.message ?? null,
    });
  }

  protected override _postFinalize(): void {
    this._computeAndEmitDiff();
  }

  // --- Private ---

  private _scanArtifacts(): void {
    const detector = this._opts.artifact?.detector;
    if (!detector) return;

    const unseen = this._text.slice(this._scannedUpTo);
    const newlineIdx = unseen.lastIndexOf("\n");
    if (newlineIdx === -1) return;

    const toScan = unseen.slice(0, newlineIdx);
    this._scannedUpTo += newlineIdx + 1;

    let changed = false;
    for (const line of toScan.split("\n")) {
      const result = detector(line, this._inArtifact);
      if (!result) continue;

      if (result.type === "open") {
        const id = result.id ?? `artifact-${++this._artifactIdSeq}`;
        this._artifacts.push({
          id,
          language: result.language,
          title: result.title,
          content: "",
          complete: false,
        });
        this._inArtifact = true;
        changed = true;
      } else if (result.type === "content" && this._inArtifact) {
        const artifact = this._artifacts[this._artifacts.length - 1]!;
        artifact.content = artifact.content
          ? artifact.content + "\n" + result.text
          : result.text;
        changed = true;
      } else if (result.type === "close" && this._inArtifact) {
        this._artifacts[this._artifacts.length - 1]!.complete = true;
        this._inArtifact = false;
        changed = true;
      }
    }

    if (changed) this._cb.onArtifacts?.([...this._artifacts]);
  }

  private _computeAndEmitDiff(): void {
    if (!this._cb.onDiff || !this._opts.diff || !this._prevText) return;
    this._cb.onDiff(this._opts.diff(this._prevText, this._text));
  }
}
