import type { StreamStatus } from "./types";

export interface BroadcastMessage {
  type: "state";
  text: string;
  status: StreamStatus;
  loading: boolean;
  done: boolean;
  error: string | null;
}

/**
 * Thin wrapper around BroadcastChannel for the sending side.
 * Used internally by StreamController.broadcast().
 */
export class StreamBroadcaster {
  readonly #channel: BroadcastChannel;

  constructor(channelName: string) {
    this.#channel = new BroadcastChannel(channelName);
  }

  post(state: Omit<BroadcastMessage, "type">): void {
    this.#channel.postMessage({ type: "state", ...state } as BroadcastMessage);
  }

  destroy(): void {
    this.#channel.close();
  }
}

/**
 * Callback-based BroadcastChannel receiver.
 * Framework packages wrap this with their reactive primitives.
 */
export class StreamBroadcastReceiver {
  readonly #channel: BroadcastChannel;

  constructor(channelName: string, onMessage: (msg: BroadcastMessage) => void) {
    this.#channel = new BroadcastChannel(channelName);
    this.#channel.onmessage = (e: MessageEvent<BroadcastMessage>) =>
      onMessage(e.data);
  }

  destroy(): void {
    this.#channel.close();
  }
}
