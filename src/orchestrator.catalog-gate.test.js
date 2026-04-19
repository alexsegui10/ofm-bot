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

// FIX D9 — assistantHasShownCatalog se mantiene exportada como stub
// (siempre devuelve false). La gate pasó a usar el flag persistente
// clients.has_seen_catalog (migración 015) — ver tests en
// src/agents/profile-manager.test.js (markClientCatalogSeen).
describe('assistantHasShownCatalog (deprecated stub)', () => {
  it('returns false regardless of input (deprecated — use clients.has_seen_catalog)', () => {
    expect(assistantHasShownCatalog([])).toBe(false);
    expect(assistantHasShownCatalog(null)).toBe(false);
    expect(assistantHasShownCatalog([
      { role: 'assistant', content: 'esto es lo que tengo: ...' },
    ])).toBe(false);
    expect(assistantHasShownCatalog([
      { role: 'assistant', content: 'tengo de culo, tetas y lencería 🔥' },
    ])).toBe(false);
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
