import { Component, computed, signal } from '@angular/core';
import {
  JsonRenderer,
  type ComponentRegistry,
  type Spec,
} from 'ngx-json-render';
import { materialCatalog, materialRegistry } from 'ngx-json-render-material';
import { catalog as demoCatalog } from '../catalog/catalog';
import { registry as demoRegistry } from '../catalog/registry';
import { SpecCheck } from '../spec-check/spec-check';
import { demoStarterSpec } from '../specs/demo-starter';
import { materialStarterSpec } from '../specs/material-starter';

type CatalogId = 'material' | 'demo';
type Panel = 'spec' | 'prompt';

/**
 * The two things the playground needs from a catalog. Structural rather than
 * `Catalog<...>` so the two catalogs, which have different generic arguments,
 * sit in one list without casts.
 */
interface CatalogFacts {
  prompt(): string;
  readonly componentNames: string[];
}

interface CatalogChoice {
  readonly id: CatalogId;
  readonly label: string;
  readonly blurb: string;
  readonly catalog: CatalogFacts;
  readonly registry: ComponentRegistry;
  readonly starter: Spec;
}

const CATALOGS: readonly CatalogChoice[] = [
  {
    id: 'material',
    label: 'Angular Material',
    blurb: 'ngx-json-render-material — 28 components, nothing to write.',
    catalog: materialCatalog,
    registry: materialRegistry,
    starter: materialStarterSpec,
  },
  {
    id: 'demo',
    label: 'This demo’s catalog',
    blurb:
      '11 hand-rolled components — the same spec grammar, your own vocabulary.',
    catalog: demoCatalog,
    registry: demoRegistry,
    starter: demoStarterSpec,
  },
];

/** Pretty-print a spec the way the editor should present it. */
function format(spec: Spec): string {
  return JSON.stringify(spec, null, 2);
}

/**
 * Playground: edit a spec by hand and watch it render, against either catalog.
 *
 * Every panel here answers a question the README can only assert — what the
 * spec grammar looks like, what a catalog costs, and what the model is
 * actually told (`catalog.prompt()`).
 */
@Component({
  selector: 'app-playground',
  imports: [JsonRenderer, SpecCheck],
  templateUrl: './playground.html',
  styleUrl: './playground.css',
})
export class Playground {
  readonly catalogs = CATALOGS;

  readonly catalogId = signal<CatalogId>('material');
  readonly panel = signal<Panel>('spec');

  /** The editor's text — the source of truth while editing. */
  readonly source = signal(format(materialStarterSpec));
  /** The last text that parsed as JSON; what the renderer is showing. */
  readonly spec = signal<Spec>(materialStarterSpec);
  readonly parseError = signal<string | null>(null);
  readonly copied = signal(false);

  private readonly choice = computed(
    () => CATALOGS.find((c) => c.id === this.catalogId()) ?? CATALOGS[0],
  );

  readonly registry = computed(() => this.choice().registry);
  readonly blurb = computed(() => this.choice().blurb);
  readonly prompt = computed(() => this.choice().catalog.prompt());
  readonly componentNames = computed(
    () => this.choice().catalog.componentNames,
  );

  readonly promptSize = computed(
    () => `${Math.round(this.prompt().length / 100) / 10} kB`,
  );

  readonly elementCount = computed(
    () => Object.keys(this.spec().elements ?? {}).length,
  );

  /** Why the check cannot run: a spec that does not parse cannot be checked. */
  readonly checkUnavailable = computed(() =>
    this.parseError() ? 'Fix the JSON above to check the spec.' : null,
  );

  onSourceInput(text: string): void {
    this.source.set(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      this.parseError.set((error as Error).message);
      return;
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      this.parseError.set(
        'A spec must be a JSON object with "root" and "elements".',
      );
      return;
    }
    this.parseError.set(null);
    this.spec.set(parsed as Spec);
  }

  selectCatalog(id: CatalogId): void {
    if (id === this.catalogId()) return;
    this.catalogId.set(id);
    this.reset();
  }

  reset(): void {
    const starter = this.choice().starter;
    this.source.set(format(starter));
    this.spec.set(starter);
    this.parseError.set(null);
  }

  async copyPrompt(): Promise<void> {
    try {
      await navigator.clipboard?.writeText(this.prompt());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // Clipboard access can be denied; the prompt is selectable either way.
    }
  }
}
