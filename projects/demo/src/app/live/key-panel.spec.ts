import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiKeyStore } from './api-key';
import { KeyPanel } from './key-panel';

afterEach(() => {
  TestBed.resetTestingModule();
  // The store reads sessionStorage on construction, so a key left behind by
  // one test would arrive already-live in the next.
  sessionStorage.clear();
});

async function settle(fixture: ComponentFixture<unknown>) {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

async function render() {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(KeyPanel);
  await settle(fixture);
  return fixture;
}

function host(fixture: ComponentFixture<KeyPanel>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function keyInput(fixture: ComponentFixture<KeyPanel>): HTMLInputElement {
  const el = host(fixture).querySelector('input.key');
  if (!el) throw new Error('the key field is not rendered');
  return el as HTMLInputElement;
}

/** Type into the key field the way a visitor would. */
async function type(fixture: ComponentFixture<KeyPanel>, value: string) {
  const input = keyInput(fixture);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle(fixture);
}

async function submit(fixture: ComponentFixture<KeyPanel>) {
  const form = host(fixture).querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await settle(fixture);
}

describe('KeyPanel', () => {
  it('starts in recorded mode with the submit button disabled', async () => {
    const fixture = await render();

    expect(host(fixture).querySelector('.badge')?.textContent).toContain(
      'recorded',
    );
    expect(host(fixture).querySelector('form')).toBeTruthy();
    expect(
      (host(fixture).querySelector('button[type=submit]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('enables the button once something is typed', async () => {
    const fixture = await render();

    await type(fixture, 'sk-ant-test');

    expect(
      (host(fixture).querySelector('button[type=submit]') as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('goes live on submit and stops offering the field', async () => {
    const fixture = await render();
    const store = TestBed.inject(ApiKeyStore);

    await type(fixture, 'sk-ant-test');
    await submit(fixture);

    expect(store.isLive()).toBe(true);
    expect(store.key()).toBe('sk-ant-test');
    expect(host(fixture).querySelector('.badge')?.textContent).toContain(
      'live',
    );
    expect(host(fixture).querySelector('form')).toBeNull();
    expect(host(fixture).textContent).toContain('Your key is set for this tab');
  });

  it('never renders the key back into the page', async () => {
    const fixture = await render();

    await type(fixture, 'sk-ant-secret-value');
    await submit(fixture);

    // The panel's own docs promise this: once accepted the key is only ever
    // read by the transport, on its way into a request header.
    expect(host(fixture).innerHTML).not.toContain('sk-ant-secret-value');
    expect(fixture.componentInstance.draft()).toBe('');
  });

  it('trims the key it accepts', async () => {
    const fixture = await render();
    const store = TestBed.inject(ApiKeyStore);

    await type(fixture, '  sk-ant-padded  ');
    await submit(fixture);

    expect(store.key()).toBe('sk-ant-padded');
  });

  it('ignores a submit with nothing but whitespace', async () => {
    const fixture = await render();
    const store = TestBed.inject(ApiKeyStore);

    await type(fixture, '   ');
    await submit(fixture);

    expect(store.isLive()).toBe(false);
    expect(host(fixture).querySelector('form')).toBeTruthy();
  });

  it('forgets the key and comes back offering the field', async () => {
    const fixture = await render();
    const store = TestBed.inject(ApiKeyStore);

    await type(fixture, 'sk-ant-test');
    await submit(fixture);
    expect(store.isLive()).toBe(true);

    (host(fixture).querySelector('button.clear') as HTMLButtonElement).click();
    await settle(fixture);

    expect(store.isLive()).toBe(false);
    expect(store.key()).toBe('');
    expect(host(fixture).querySelector('form')).toBeTruthy();
    expect(host(fixture).querySelector('.badge')?.textContent).toContain(
      'recorded',
    );
  });

  it('picks the model from the select, in both modes', async () => {
    const fixture = await render();
    const store = TestBed.inject(ApiKeyStore);
    expect(store.model()).toBe('claude-opus-5');

    const choose = async (value: string) => {
      const select = host(fixture).querySelector(
        'select.model',
      ) as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new Event('change'));
      await settle(fixture);
    };

    await choose('claude-haiku-4-5');
    expect(store.model()).toBe('claude-haiku-4-5');

    // The live half of the panel has a select of its own, and it has to drive
    // the same setting.
    await type(fixture, 'sk-ant-test');
    await submit(fixture);
    await choose('claude-sonnet-5');

    expect(store.model()).toBe('claude-sonnet-5');
  });

  it('offers every model the store declares', async () => {
    const fixture = await render();

    const options = Array.from(
      host(fixture).querySelectorAll('select.model option'),
    ).map((option) => (option as HTMLOptionElement).value);

    expect(options).toEqual([
      'claude-opus-5',
      'claude-sonnet-5',
      'claude-haiku-4-5',
    ]);
  });
});
