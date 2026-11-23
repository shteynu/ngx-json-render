import { Injectable, signal } from '@angular/core';
import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { answerSchema, systemPrompt } from './ui-schema';

export interface ModelOption {
  /** WebLLM's model id, without the quantization suffix. */
  id: string;
  label: string;
  download: string;
}

export const MODELS: readonly ModelOption[] = [
  { id: 'Qwen2.5-1.5B-Instruct', label: 'Qwen2.5 1.5B', download: '≈ 1 GB' },
  { id: 'Qwen2.5-3B-Instruct', label: 'Qwen2.5 3B', download: '≈ 2 GB' },
];

export type ModelState =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: number; text: string }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

interface GpuNavigator {
  gpu?: {
    requestAdapter(): Promise<{ features: ReadonlySet<string> } | null>;
  };
}

/** Whether this browser exposes WebGPU, and whether its GPU can do f16. */
export async function probeWebGpu(): Promise<{ ok: boolean; f16: boolean }> {
  const gpu = (navigator as Navigator & GpuNavigator).gpu;
  if (!gpu) return { ok: false, f16: false };
  try {
    const adapter = await gpu.requestAdapter();
    return { ok: !!adapter, f16: !!adapter?.features.has('shader-f16') };
  } catch {
    return { ok: false, f16: false };
  }
}

/**
 * A model running in the visitor's browser. WebLLM downloads the weights from
 * Hugging Face once, keeps them in the browser's cache, and runs them on the
 * GPU through WebGPU, in a worker. No request leaves the page after that.
 */
@Injectable({ providedIn: 'root' })
export class LocalModel {
  readonly state = signal<ModelState>({ kind: 'idle' });
  readonly loaded = signal<ModelOption | null>(null);

  private engine: WebWorkerMLCEngine | null = null;
  private readonly schema = JSON.stringify(answerSchema());
  private readonly system = systemPrompt();

  async load(model: ModelOption, f16: boolean): Promise<void> {
    if (this.state().kind === 'loading') return;
    this.state.set({ kind: 'loading', progress: 0, text: 'Starting…' });
    try {
      // The library is several megabytes; fetch it only once it is wanted.
      const webllm = await import('@mlc-ai/web-llm');
      const modelId = `${model.id}-${f16 ? 'q4f16_1' : 'q4f32_1'}-MLC`;
      const initProgressCallback = (report: {
        progress: number;
        text: string;
      }) =>
        this.state.set({
          kind: 'loading',
          progress: report.progress,
          text: report.text,
        });
      if (this.engine) {
        this.engine.setInitProgressCallback(initProgressCallback);
        await this.engine.reload(modelId);
      } else {
        this.engine = await webllm.CreateWebWorkerMLCEngine(
          new Worker(new URL('./llm.worker', import.meta.url), {
            type: 'module',
          }),
          modelId,
          { initProgressCallback },
        );
      }
      this.loaded.set(model);
      this.state.set({ kind: 'ready' });
    } catch (error) {
      this.loaded.set(null);
      this.state.set({ kind: 'error', message: describe(error) });
    }
  }

  /**
   * Streams the model's answer to `prompt`, calling `onText` with all of the
   * text so far after every token. The grammar built from the answer schema
   * keeps that text a prefix of valid JSON in the answer's shape.
   */
  async generate(
    prompt: string,
    onText: (text: string) => void,
  ): Promise<void> {
    const engine = this.engine;
    if (!engine) throw new Error('Load a model first.');
    const chunks = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: this.system },
        { role: 'user', content: prompt },
      ],
      stream: true,
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: 'json_object', schema: this.schema },
    });
    let text = '';
    for await (const chunk of chunks) {
      text += chunk.choices[0]?.delta.content ?? '';
      onText(text);
    }
  }

  stop(): void {
    this.engine?.interruptGenerate();
  }
}

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/out of memory|device.*lost/i.test(message)) {
    return `The GPU ran out of memory (${message}). Try the smaller model, or close other tabs.`;
  }
  return message;
}
