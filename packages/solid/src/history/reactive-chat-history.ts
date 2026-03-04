import { createSignal, createMemo, type Accessor } from 'solid-js';
import { ChatHistory, type TreeConfig } from '@aibind/core';

/**
 * SolidJS reactive wrapper around {@link ChatHistory}.
 *
 * All mutations automatically trigger reactive updates via SolidJS signals.
 * Derived state (`messages`, `nodeIds`, `isEmpty`, `size`) are exposed as
 * `Accessor` functions that update when the underlying data changes.
 *
 * Access the underlying `ChatHistory` via the `inner` property for
 * non-reactive operations or direct tree access.
 *
 * @example
 * ```tsx
 * import { ReactiveChatHistory } from '@aibind/solid/history';
 *
 * function Chat() {
 *   const chat = new ReactiveChatHistory<{ role: string; content: string }>();
 *
 *   const m1 = chat.append({ role: 'user', content: 'Hello' });
 *   // chat.messages() is reactive — UI updates automatically
 *
 *   return (
 *     <div>
 *       <For each={chat.messages()}>
 *         {(msg, i) => (
 *           <div>
 *             {msg.role}: {msg.content}
 *             {chat.hasAlternatives(chat.nodeIds()[i()]) && (
 *               <>
 *                 <button onClick={() => chat.prevAlternative(chat.nodeIds()[i()])}>Prev</button>
 *                 <span>
 *                   {chat.alternativeIndex(chat.nodeIds()[i()]) + 1}
 *                   /{chat.alternativeCount(chat.nodeIds()[i()])}
 *                 </span>
 *                 <button onClick={() => chat.nextAlternative(chat.nodeIds()[i()])}>Next</button>
 *               </>
 *             )}
 *           </div>
 *         )}
 *       </For>
 *     </div>
 *   );
 * }
 * ```
 */
export class ReactiveChatHistory<M> {
	/** The underlying non-reactive ChatHistory. */
	readonly inner: ChatHistory<M>;

	private _getVersion: Accessor<number>;
	private _setVersion: (v: number | ((prev: number) => number)) => void;

	// ─── Reactive Accessors ──────────────────────────────────────

	/** Linear message path from root to active leaf. Reactive accessor. */
	readonly messages: Accessor<M[]>;

	/** Node IDs corresponding to each message in the active path. Reactive accessor. */
	readonly nodeIds: Accessor<string[]>;

	/** Whether the history is empty. Reactive accessor. */
	readonly isEmpty: Accessor<boolean>;

	/** Total number of messages across all branches. Reactive accessor. */
	readonly size: Accessor<number>;

	constructor(config?: TreeConfig) {
		this.inner = new ChatHistory<M>(config);

		const [getVersion, setVersion] = createSignal(0);
		this._getVersion = getVersion;
		this._setVersion = setVersion;

		this.messages = createMemo(() => {
			getVersion();
			return this.inner.messages;
		});
		this.nodeIds = createMemo(() => {
			getVersion();
			return this.inner.nodeIds;
		});
		this.isEmpty = createMemo(() => {
			getVersion();
			return this.inner.isEmpty;
		});
		this.size = createMemo(() => {
			getVersion();
			return this.inner.size;
		});
	}

	// ─── Mutations (trigger reactivity) ─────────────────────────

	/**
	 * Append a message to the current conversation path.
	 * @returns The new node's ID.
	 */
	append(message: M): string {
		const id = this.inner.append(message);
		this._setVersion((v) => v + 1);
		return id;
	}

	/**
	 * Edit a message by creating a new branch from its parent.
	 * The edited message becomes a sibling of the original.
	 * Sets the new branch as active.
	 *
	 * @param messageId - ID of the message to "edit" (a sibling will be created).
	 * @param newMessage - The replacement message content.
	 * @returns The new node's ID.
	 * @throws If messageId does not exist.
	 */
	edit(messageId: string, newMessage: M): string {
		const id = this.inner.edit(messageId, newMessage);
		this._setVersion((v) => v + 1);
		return id;
	}

	/**
	 * Regenerate a response by creating a new branch from its parent.
	 * Semantically identical to `edit()` — creates a sibling alternative.
	 *
	 * @param messageId - ID of the message to regenerate (a sibling will be created).
	 * @param newResponse - The new response content.
	 * @returns The new node's ID.
	 * @throws If messageId does not exist.
	 */
	regenerate(messageId: string, newResponse: M): string {
		const id = this.inner.regenerate(messageId, newResponse);
		this._setVersion((v) => v + 1);
		return id;
	}

	// ─── Alternative Navigation ─────────────────────────────────

	/** Whether a message has alternative siblings (branches). */
	hasAlternatives(nodeId: string): boolean {
		return this.inner.hasAlternatives(nodeId);
	}

	/** Total number of alternatives (siblings) for a message. */
	alternativeCount(nodeId: string): number {
		return this.inner.alternativeCount(nodeId);
	}

	/** 0-based index of a message among its siblings. */
	alternativeIndex(nodeId: string): number {
		return this.inner.alternativeIndex(nodeId);
	}

	/**
	 * Switch to the next alternative (right) and follow to leaf.
	 * Updates the active path.
	 * @throws If nodeId does not exist.
	 */
	nextAlternative(nodeId: string): void {
		this.inner.nextAlternative(nodeId);
		this._setVersion((v) => v + 1);
	}

	/**
	 * Switch to the previous alternative (left) and follow to leaf.
	 * Updates the active path.
	 * @throws If nodeId does not exist.
	 */
	prevAlternative(nodeId: string): void {
		this.inner.prevAlternative(nodeId);
		this._setVersion((v) => v + 1);
	}

	// ─── Persistence ────────────────────────────────────────────

	/** Serialize to a JSON string. */
	toJSON(): string {
		return this.inner.toJSON();
	}

	/** Restore from a JSON string. Returns a new reactive instance. */
	static fromJSON<M>(json: string, config?: TreeConfig): ReactiveChatHistory<M> {
		const instance = new ReactiveChatHistory<M>(config);
		const restored = ChatHistory.fromJSON<M>(json, config);
		(instance as { inner: ChatHistory<M> }).inner = restored;
		// Bump version so memos re-evaluate with the restored inner tree
		instance._setVersion((v) => v + 1);
		return instance;
	}
}
