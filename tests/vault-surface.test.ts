import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { VaultSurface } from '../src/web/components/vault-surface.tsx';

async function surface(onClose: () => void) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'http://localhost/vault',
    pretendToBeVisual: true,
  });
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    FormData: dom.window.FormData,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const originals = new Map(
    Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  await act(async () =>
    root.render(
      createElement(VaultSurface, {
        label: 'Test surface',
        onClose,
        children: createElement('input', { 'aria-label': 'entry name' }),
      }),
    ),
  );
  return {
    input: dom.window.document.querySelector('input')!,
    window: dom.window,
    async close() {
      await act(async () => root.unmount());
      dom.window.close();
      for (const [key, value] of originals)
        if (value) Object.defineProperty(globalThis, key, value);
        else Reflect.deleteProperty(globalThis, key);
    },
  };
}

test('Escape while an IME composition is active only cancels the composition', async () => {
  let closed = 0;
  const view = await surface(() => closed++);
  try {
    for (const composing of [{ isComposing: true }, { keyCode: 229 }]) {
      await act(async () => {
        view.input.dispatchEvent(
          new view.window.KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
            ...composing,
          }),
        );
      });
      assert.equal(closed, 0, `surface closed with ${JSON.stringify(composing)}`);
      assert.ok(view.input.isConnected, 'the edited field is still on the page');
    }
  } finally {
    await view.close();
  }
});

test('Escape outside a composition still closes the surface', async () => {
  let closed = 0;
  const view = await surface(() => closed++);
  try {
    await act(async () => {
      view.input.dispatchEvent(
        new view.window.KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    assert.equal(closed, 1);
  } finally {
    await view.close();
  }
});
