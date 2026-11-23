/// <reference lib="webworker" />
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

// The model runs here, off the main thread: WebGPU does the maths, but the
// tokenizer and the grammar that keeps the output valid JSON run on the CPU
// for every token, and on the main thread they would stutter the page.
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (message: MessageEvent) => handler.onmessage(message);
