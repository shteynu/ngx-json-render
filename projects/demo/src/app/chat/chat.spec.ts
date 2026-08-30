import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { CHAT_EXCHANGES } from '../specs/chat';
import { ChatTab } from './chat';

afterEach(() => {
  TestBed.resetTestingModule();
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
  const fixture = TestBed.createComponent(ChatTab);
  await settle(fixture);
  return fixture;
}

/** Wait for the reply to finish, with a bound so a hang fails the test. */
async function drain(fixture: ComponentFixture<ChatTab>) {
  const chat = fixture.componentInstance.chat;
  for (let i = 0; i < 400 && chat.isStreaming(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await settle(fixture);
}

async function say(fixture: ComponentFixture<ChatTab>, index: number) {
  fixture.componentInstance.ask(CHAT_EXCHANGES[index]);
  await drain(fixture);
}

describe('ChatTab', () => {
  it('answers with prose and a UI in one turn', async () => {
    const fixture = await render();
    const globalFetch = vi.spyOn(globalThis, 'fetch');

    await say(fixture, 0);

    const messages = fixture.componentInstance.chat.messages();
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);

    const reply = messages[1];
    expect(reply.text).toContain('deploys are up');
    // The fences are the parser's business and never reach the text.
    expect(reply.text).not.toContain('```');
    expect(reply.spec?.elements['m-deploys']).toBeTruthy();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Deploys');
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('keeps the first turn’s UI when a second turn generates its own', async () => {
    const fixture = await render();

    await say(fixture, 0);
    await say(fixture, 1);

    const messages = fixture.componentInstance.chat.messages();
    expect(messages.length).toBe(4);

    const first = messages[1];
    const second = messages[3];
    // Each assistant message owns its spec; the second did not overwrite it.
    expect(first.spec?.elements['m-deploys']).toBeTruthy();
    expect(first.spec?.elements['email']).toBeUndefined();
    expect(second.spec?.elements['email']).toBeTruthy();
    expect(second.spec?.elements['m-deploys']).toBeUndefined();

    // And both are still on screen.
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Deploys');
    expect(host.textContent).toContain('Join the beta');
    expect(host.querySelectorAll('json-render').length).toBe(2);
  });

  it('surfaces a failed reply and recovers on the next one', async () => {
    const fixture = await render();
    fixture.componentInstance.failNext.set(true);

    await say(fixture, 0);

    const host = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.chat.error()?.message).toBe(
      'The model provider returned 503.',
    );
    expect(host.textContent).toContain('The reply failed');

    fixture.componentInstance.failNext.set(false);
    await say(fixture, 1);

    expect(fixture.componentInstance.chat.error()).toBeNull();
    expect(host.textContent).toContain('Join the beta');
  });
});
