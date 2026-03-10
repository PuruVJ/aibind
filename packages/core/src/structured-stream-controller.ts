/**
 * Structured stream controller.
 *
 * Extends BaseStreamController with schema resolution and typed partial/final
 * object handling. Consumes `partial` and `data` SSE events emitted by the
 * server's `streamObject`-powered `/structured` endpoint.
 *
 * Does NOT accumulate raw text — all JSON parsing happens server-side.
 */

import {
  BaseStreamController,
  type BaseStreamCallbacks,
  type BaseStreamControllerOptions,
} from "./base-stream-controller";
import type { DeepPartial } from "./types";

// --- Callbacks ---

export interface StructuredStreamCallbacks<T> extends BaseStreamCallbacks {
  onPartial(partial: DeepPartial<T> | null): void;
  onData(data: T | null): void;
  /** Optional raw-text callback — never called by StructuredStreamController itself. */
  onText?(text: string): void;
}

export interface StructuredStreamControllerOptions<
  T,
> extends BaseStreamControllerOptions {
  schema: import("@standard-schema/spec").StandardSchemaV1<unknown, T>;
  onFinish?: (data: T) => void;
}

// --- StructuredStreamController ---

export class StructuredStreamController<T> extends BaseStreamController {
  declare protected _opts: StructuredStreamControllerOptions<T>;
  declare protected _cb: StructuredStreamCallbacks<T>;

  private _schema: import("@standard-schema/spec").StandardSchemaV1<unknown, T>;
  private _onStructuredFinish?: (data: T) => void;
  private _resolvedJsonSchema: Record<string, unknown> | null = null;
  private _schemaResolved = false;
  private _pendingData: unknown = null;

  constructor(
    options: StructuredStreamControllerOptions<T>,
    callbacks: StructuredStreamCallbacks<T>,
  ) {
    super(options, callbacks);
    this._opts = options;
    this._cb = callbacks;
    this._schema = options.schema;
    this._onStructuredFinish = options.onFinish;
  }

  // --- Hook overrides ---

  protected override async _buildBody(
    prompt: string,
    system: string | undefined,
    model: string | undefined,
  ): Promise<Record<string, unknown>> {
    const body = await super._buildBody(prompt, system, model);
    const schema = await this._resolveSchema();
    return { ...body, ...(schema && { schema }) };
  }

  protected override _handleNamedEvent(event: string, data: string): boolean {
    if (event === "partial") {
      try {
        const partial = JSON.parse(data) as DeepPartial<T>;
        this._cb.onPartial(partial);
      } catch {
        // Malformed partial — skip
      }
      return true;
    }
    if (event === "data") {
      try {
        this._pendingData = JSON.parse(data);
      } catch {
        // Malformed data — _finalize will be a no-op
      }
      return true;
    }
    return false;
  }

  protected override async _finalize(): Promise<void> {
    if (this._pendingData == null) return;
    const result = await this._schema["~standard"].validate(this._pendingData);
    if (result.issues) {
      throw new Error(
        `Validation failed: ${result.issues.map((i: { message: string }) => i.message).join(", ")}`,
      );
    }
    this._cb.onData(result.value);
    this._onStructuredFinish?.(result.value);
    this._pendingData = null;
  }

  protected override _resetState(): void {
    super._resetState();
    this._pendingData = null;
    this._cb.onData(null);
    this._cb.onPartial(null);
  }

  // --- Schema resolution ---

  private async _resolveSchema(): Promise<Record<string, unknown> | null> {
    if (this._schemaResolved) return this._resolvedJsonSchema;
    this._schemaResolved = true;

    const std = (this._schema as any)["~standard"];

    // 1. StandardJSONSchemaV1 (e.g. Zod v4)
    if (std?.jsonSchema && Object.keys(std.jsonSchema).length > 0) {
      this._resolvedJsonSchema = std.jsonSchema as Record<string, unknown>;
      return this._resolvedJsonSchema;
    }

    // 2. Schema instance has .toJsonSchema() (ArkType)
    const schema = this._schema as any;
    if (typeof schema.toJsonSchema === "function") {
      try {
        this._resolvedJsonSchema = schema.toJsonSchema() as Record<
          string,
          unknown
        >;
        return this._resolvedJsonSchema;
      } catch {
        /* toJsonSchema() failed */
      }
    }

    // 3. Vendor-specific auto-conversion
    if (std?.vendor === "valibot") {
      try {
        // @ts-ignore -- optional dependency, resolved at runtime
        const { toJsonSchema } = await import(
          /* @vite-ignore */ "@valibot/to-json-schema"
        );
        this._resolvedJsonSchema = toJsonSchema(schema as never) as Record<
          string,
          unknown
        >;
        return this._resolvedJsonSchema;
      } catch {
        throw new Error(
          '@aibind: Valibot schema detected but "@valibot/to-json-schema" is not installed.',
        );
      }
    }

    if (std?.vendor === "zod") {
      try {
        // @ts-ignore -- optional dependency, resolved at runtime
        const { toJSONSchema } = await import(/* @vite-ignore */ "zod/v4");
        this._resolvedJsonSchema = toJSONSchema(schema as never) as Record<
          string,
          unknown
        >;
        return this._resolvedJsonSchema;
      } catch {
        throw new Error(
          '@aibind: Zod schema detected but "zod/v4" is not available.',
        );
      }
    }

    return null;
  }
}
