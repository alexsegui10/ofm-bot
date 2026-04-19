import { describe, it, expect, vi } from 'vitest';

vi.mock('./lib/llm-client.js', () => ({
  callAnthropic: vi.fn(),
  callOpenRouter: vi.fn(),
}));
vi.mock('./lib/persona-config.js', () => ({
  getPersonaContent: vi.fn(() => ''),
  getHardLimits: vi.fn(() => ''),
  getTechnicalRules: vi.fn(() => ''),
}));
vi.mock('./lib/telegram.js', () => ({
  sendMessage: vi.fn(),
  sendChatAction: vi.fn(),
}));
vi.mock('./lib/db.js', () => ({
  query: vi.fn(),
  closePool: vi.fn(),
}));

import { assistantHasShownCatalog, clientExplicitlyAsksCatalog } from './orchestrator.js';

describe('assistantHasShownCatalog', () => {
  it('returns false on empty / null history', () => {
    expect(assistantHasShownCatalog([])).toBe(false);
    expect(assistantHasShownCatalog(null)).toBe(false);
    expect(assistantHasShownCatalog(undefined)).toBe(false);
  });

  it('returns true when assistant message contains the full-catalog header', () => {
    const history = [
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'esto es lo que tengo:\n\n📸 fotos sueltas 7€/una...' },
    ];
    expect(assistantHasShownCatalog(history)).toBe(true);
  });

  it('returns true when assistant message contains the photos category-detail closer', () => {
    const history = [
      { role: 'assistant', content: 'tengo de culo, tetas y lencería 🔥\n1 foto de culo 7€...\ncuántas quieres?' },
    ];
    expect(assistantHasShownCatalog(history)).toBe(true);
  });

  it('returns false when no catalog markers appear', () => {
    const history = [
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'holaa bebe 😈 cómo va eso' },
      { role: 'user', content: 'bien y tú?' },
      { role: 'assistant', content: 'aquí tumbada pensando guarradas...' },
    ];
    expect(assistantHasShownCatalog(history)).toBe(false);
  });

  it('only inspects assistant messages, not user messages', () => {
    const history = [
      { role: 'user', content: 'esto es lo que tengo: dinero' },
    ];
    expect(assistantHasShownCatalog(history)).toBe(false);
  });

  it('respects the lookback window', () => {
    const history = [
      { role: 'assistant', content: 'esto es lo que tengo: ...' },
      ...Array.from({ length: 8 }, () => ({ role: 'assistant', content: 'algo' })),
    ];
    // Default lookback is 6 → the catalog message is now off-window
    expect(assistantHasShownCatalog(history)).toBe(false);
    expect(assistantHasShownCatalog(history, 20)).toBe(true);
  });
});

describe('clientExplicitlyAsksCatalog', () => {
  it('returns true for price_question intent regardless of text', () => {
    expect(clientExplicitlyAsksCatalog('cuánto', 'price_question')).toBe(true);
    expect(clientExplicitlyAsksCatalog('', 'price_question')).toBe(true);
  });

  it('returns true for "qué tienes" / "qué vendes"', () => {
    expect(clientExplicitlyAsksCatalog('qué tienes?', 'small_talk')).toBe(true);
    expect(clientExplicitlyAsksCatalog('que vendes', 'small_talk')).toBe(true);
    expect(clientExplicitlyAsksCatalog('qué ofreces', 'small_talk')).toBe(true);
  });

  it('returns true for menu / catálogo / lista keywords', () => {
    expect(clientExplicitlyAsksCatalog('mándame el menú', 'small_talk')).toBe(true);
    expect(clientExplicitlyAsksCatalog('dime el catálogo', 'small_talk')).toBe(true);
    expect(clientExplicitlyAsksCatalog('quiero la lista', 'small_talk')).toBe(true);
  });

  it('returns true when the client asks to repeat the menu', () => {
    expect(clientExplicitlyAsksCatalog('repíteme el menú', 'small_talk')).toBe(true);
    expect(clientExplicitlyAsksCatalog('recuérdame los precios', 'small_talk')).toBe(true);
  });

  it('returns false on conversational chat without catalog signal', () => {
    expect(clientExplicitlyAsksCatalog('hola bebe', 'small_talk')).toBe(false);
    expect(clientExplicitlyAsksCatalog('quiero 2 fotos de culo', 'buy_single_photos')).toBe(false);
    expect(clientExplicitlyAsksCatalog('me paso por bizum', 'payment_method_selection')).toBe(false);
  });

  it('returns false on null / empty inputs', () => {
    expect(clientExplicitlyAsksCatalog(null, 'small_talk')).toBe(false);
    expect(clientExplicitlyAsksCatalog('', 'small_talk')).toBe(false);
  });
});
