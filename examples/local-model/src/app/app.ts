import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule, NgModel } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import type { Spec } from '@json-render/core';
import { JsonRenderer } from 'ngx-json-render';
import { materialRegistry } from 'ngx-json-render-material';
import {
  LocalModel,
  MODELS,
  probeWebGpu,
  type ModelOption,
} from './local-model';
import { parsePartialJson } from './partial-json';
import { RECORDED } from './recorded';
import { treeToSpec } from './ui-schema';

interface Turn {
  id: number;
  prompt: string;
  /** The model's output so far: a prefix of the answer's JSON. */
  raw: string;
  say: string;
  spec: Spec | null;
  streaming: boolean;
  source: 'model' | 'recorded';
  /** Model name and timing, once the answer is complete. */
  note?: string;
  error?: string;
}

@Component({
  selector: 'app-root',
  imports: [
    FormsModule,
    JsonRenderer,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly model = inject(LocalModel);
  readonly registry = materialRegistry;
  readonly models = MODELS;
  readonly suggestions = RECORDED.map((r) => r.prompt);

  /** `null` while the probe runs. */
  readonly gpu = signal<{ ok: boolean; f16: boolean } | null>(null);
  readonly choice = signal<ModelOption>(MODELS[0]);
  readonly turns = signal<readonly Turn[]>([]);
  readonly draft = signal('');

  readonly busy = computed(() => this.turns().some((t) => t.streaming));
  readonly ready = computed(() => this.model.state().kind === 'ready');

  /**
   * Cleared through its control: text pasted and sent before change
   * detection runs never reaches the `ngModel` binding, so setting `draft`
   * back to '' would look like no change and leave the text in the field.
   */
  private readonly field = viewChild(NgModel);
  private nextId = 0;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  constructor() {
    void probeWebGpu().then((gpu) => this.gpu.set(gpu));
  }

  load(): void {
    void this.model.load(this.choice(), this.gpu()?.f16 ?? false);
  }

  /**
   * Asks the model when one is loaded. Before that, a suggested prompt
   * replays its recorded answer through the same parsing path, so the page
   * shows the renderer at work without a download.
   */
  send(prompt = this.draft()): void {
    prompt = prompt.trim();
    if (!prompt || this.busy()) return;
    const recorded = RECORDED.find((r) => r.prompt === prompt);
    if (!this.ready() && !recorded) return;
    this.draft.set('');
    this.field()?.control.setValue('');

    const id = this.nextId++;
    const source = this.ready() ? 'model' : 'recorded';
    this.turns.update((turns) => [
      ...turns,
      { id, prompt, raw: '', say: '', spec: null, streaming: true, source },
    ]);
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector('.turn:last-of-type')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      { injector: this.injector },
    );
    const started = performance.now();
    const onText = (raw: string) => this.update(id, raw);
    const run =
      source === 'model'
        ? this.model.generate(prompt, onText)
        : replay(recorded!.json, onText);

    run
      .then(() => {
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        const by =
          source === 'model'
            ? `${this.model.loaded()?.label} in your browser`
            : 'recorded answer';
        this.patch(id, { streaming: false, note: `${by} · ${seconds} s` });
      })
      .catch((error: unknown) =>
        this.patch(id, {
          streaming: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
  }

  stop(): void {
    this.model.stop();
  }

  private update(id: number, raw: string): void {
    const answer = parsePartialJson(raw) as
      { say?: unknown; ui?: unknown } | undefined;
    const say = typeof answer?.say === 'string' ? answer.say : '';
    const spec = treeToSpec(answer?.ui);
    this.patch(id, { raw, say, ...(spec ? { spec } : {}) });
  }

  private patch(id: number, change: Partial<Turn>): void {
    this.turns.update((turns) =>
      turns.map((turn) => (turn.id === id ? { ...turn, ...change } : turn)),
    );
  }
}

/** Streams recorded text a few characters at a time, as a model would. */
async function replay(
  json: string,
  onText: (text: string) => void,
): Promise<void> {
  for (let end = 0; end < json.length;) {
    end = Math.min(json.length, end + 4 + Math.floor(Math.random() * 6));
    onText(json.slice(0, end));
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
}
