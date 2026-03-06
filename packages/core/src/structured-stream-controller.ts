/**
 * Framework-agnostic structured stream controller.
 *
 * Extends StreamController with schema resolution, partial JSON parsing,
 * and final validation via Standard Schema.
 */

import {
  StreamController,
  type StreamCallbacks,
  type StreamControllerOptions,
} from "./stream-controller";
import { parsePartialJSON } from "./stream-utils";
import type { DeepPartial } from "./types";

// --- Callbacks ---

export interface StructuredStreamCallbacks<T> extends StreamCallbacks {
  onPartial(partial: DeepPartial<T> | null): void;
  onData(data: T | null): void;
}

export interface StructuredStreamControllerOptions<T> extends Omit<
  StreamControllerOptions,
  "onFinish"
> {
  schema: import("@standard-schema/spec").StandardSchemaV1<unknown, T>;
  onFinish?: (data: T) => void;
}

// --- StructuredStreamController ---

export class StructuredStreamController<T> extends StreamController {
  private _schema: import("@standard-schema/spec").StandardSchemaV1<unknown, T>;
  private _onStructuredFinish?: (data: T) => void;
  private _resolvedJsonSchema: Record<string, unknown> | null = null;
  private _schemaResolved = false;
  private _structuredCb: StructuredStreamCallbacks<T>;

  constructor(
    options: StructuredStreamControllerOptions<T>,
    callbacks: StructuredStreamCallbacks<T>,
  ) {
    const { schema, onFinish, ...rest } = options;
    super(rest, callbacks);
    this._schema = schema;
    this._onStructuredFinish = onFinish;
    this._structuredCb = callbacks;
  }

  protected override async _buildBody(
    prompt: string,
    system: string | undefined,
    model: string | undefined,
  ): Promise<Record<string, unknown>> {
    const body = await super._buildBody(prompt, system, model);
    const schema = await this._resolveSchema();
    return { ...body, ...(schema && { schema }) };
  }

  protected override _processChunk(chunk: string): void {
    super._processChunk(chunk);
    const parsed = parsePartialJSON<T>(this._text);
    if (parsed) this._structuredCb.onPartial(parsed as DeepPartial<T>);
  }

  protected override async _finalize(): Promise<void> {
    const finalParsed = JSON.parse(this.text);
    const result = await this._schema["~standard"].validate(finalParsed);
    if (result.issues) {
      throw new Error(
        `Validation failed: ${result.issues.map((i: { message: string }) => i.message).join(", ")}`,
      );
    }
    this._structuredCb.onData(result.value);
    this._onStructuredFinish?.(result.value);
  }

  protected override _resetState(): void {
    super._resetState();
    this._structuredCb.onData(null);
    this._structuredCb.onPartial(null);
  }

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
