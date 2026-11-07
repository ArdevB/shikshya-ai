import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';

/**
 * What the app needs from a language model, in its own words. Only this file knows it is Gemini,
 * so another provider means one new class, and tests can use a fake.
 */
export interface LlmTool {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmToolResult {
  callId: string;
  name: string;
  /** Text the model reads. Treated as data by the system prompt, never as instructions. */
  result: string;
  isError: boolean;
}

export type LlmInput =
  { kind: 'text'; text: string } | { kind: 'toolResults'; results: LlmToolResult[] };

export interface LlmTurnRequest {
  system: string;
  input: LlmInput;
  /** Continues from an earlier turn. Empty starts afresh. */
  previousId: string | null;
  tools: LlmTool[];
  /** Called with each piece of text as it arrives. */
  onText: (text: string) => void;
}

export interface LlmTurnResult {
  /** Pass this as `previousId` to continue. */
  id: string | null;
  text: string;
  toolCalls: LlmToolCall[];
  tokensIn: number | null;
  tokensOut: number | null;
}

export type EmbeddingPurpose = 'document' | 'query';

export interface LlmClient {
  readonly model: string;
  readonly embeddingModel: string;
  turn(request: LlmTurnRequest): Promise<LlmTurnResult>;
  embed(texts: string[], purpose: EmbeddingPurpose): Promise<number[][]>;
}

/** The vector size the database column holds. Changing it means re-indexing every document. */
export const EMBEDDING_DIMENSIONS = 768;
/** Gemini takes this many texts in one embedding request. */
const EMBEDDING_BATCH = 50;

function parseArguments(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    // Cut-off JSON. The tool's own validation then reports what is missing.
    return {};
  }
}

class GeminiClient implements LlmClient {
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    readonly embeddingModel: string,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async turn(request: LlmTurnRequest): Promise<LlmTurnResult> {
    const input =
      request.input.kind === 'text'
        ? request.input.text
        : request.input.results.map((item) => ({
            type: 'function_result' as const,
            name: item.name,
            call_id: item.callId,
            is_error: item.isError,
            result: [{ type: 'text' as const, text: item.result }],
          }));

    // With the default `store`, Gemini keeps each turn, including the signatures it needs for its
    // own reasoning, so a conversation continues with just the previous id.
    const stream = await this.ai.interactions.create({
      model: this.model,
      system_instruction: request.system,
      input,
      tools: request.tools.map((tool) => ({
        type: 'function' as const,
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
      previous_interaction_id: request.previousId ?? undefined,
      stream: true,
    });

    let id: string | null = null;
    let text = '';
    let tokensIn: number | null = null;
    let tokensOut: number | null = null;
    const calls = new Map<number, { id: string; name: string; raw: string }>();

    for await (const event of stream) {
      switch (event.event_type) {
        case 'interaction.created':
          id = event.interaction.id ?? id;
          break;
        case 'step.start':
          if (event.step.type === 'function_call') {
            const start = event.step.arguments;
            calls.set(event.index, {
              id: event.step.id,
              name: event.step.name,
              // Short calls can arrive whole here, rather than as deltas.
              raw: start && Object.keys(start).length ? JSON.stringify(start) : '',
            });
          }
          break;
        case 'step.delta':
          if (event.delta.type === 'text') {
            const piece = event.delta.text ?? '';
            text += piece;
            if (piece) request.onText(piece);
          } else if (event.delta.type === 'arguments_delta') {
            const call = calls.get(event.index);
            if (call) call.raw += event.delta.arguments ?? '';
          }
          break;
        case 'interaction.completed':
          id = event.interaction.id ?? id;
          tokensIn = event.interaction.usage?.total_input_tokens ?? tokensIn;
          tokensOut = event.interaction.usage?.total_output_tokens ?? tokensOut;
          break;
        case 'error':
          throw new Error(event.error?.message ?? 'Gemini reported an error');
        default:
          break;
      }
    }

    return {
      id,
      text,
      tokensIn,
      tokensOut,
      toolCalls: [...calls.values()].map((call) => ({
        id: call.id,
        name: call.name,
        arguments: parseArguments(call.raw),
      })),
    };
  }

  async embed(texts: string[], purpose: EmbeddingPurpose): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += EMBEDDING_BATCH) {
      const response = await this.ai.models.embedContent({
        model: this.embeddingModel,
        contents: texts.slice(start, start + EMBEDDING_BATCH),
        config: {
          taskType: purpose === 'document' ? 'RETRIEVAL_DOCUMENT' : 'RETRIEVAL_QUERY',
          outputDimensionality: EMBEDDING_DIMENSIONS,
        },
      });
      for (const embedding of response.embeddings ?? []) {
        vectors.push(embedding.values ?? []);
      }
    }
    if (vectors.length !== texts.length) {
      throw new Error(`Expected ${texts.length} embeddings, got ${vectors.length}`);
    }
    return vectors;
  }
}

let override: LlmClient | null | undefined;

/** Null when no API key is set, so callers can say the feature is not set up. */
export function getLlm(): LlmClient | null {
  if (override !== undefined) return override;
  if (!env.GEMINI_API_KEY) return null;
  return new GeminiClient(env.GEMINI_API_KEY, env.LLM_MODEL, env.EMBEDDING_MODEL);
}

/** For tests. Pass undefined to go back to the real client. */
export function setLlmForTests(client: LlmClient | null | undefined) {
  override = client;
}
