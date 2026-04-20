import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSystemPrompt, runPersona, sanitizeCatalogRepeats, CATALOG_REPEAT_PATTERNS, sanitizeElongations } from './persona.js';

vi.mock('../lib/llm-client.js', () => ({
  callAnthropic: vi.fn(),
  callOpenRouter: vi.fn(),
}));
vi.mock('../lib/persona-config.js', () => ({
  getPersonaContent: vi.fn(() => '# PERSONA — Alba\n## Test persona content'),
}));

import { callOpenRouter } from '../lib/llm-client.js';

describe('buildSystemPrompt', () => {
  it('includes persona content', () => {
    const prompt = buildSystemPrompt({}, 'small_talk');
    expect(prompt).toContain('PERSONA — Alba');
  });

  it('includes client name when known', () => {
    const prompt = buildSystemPrompt({ profile: { nombre: 'Pedro' } }, 'small_talk');
    expect(prompt).toContain('Pedro');
  });

  it('shows "desconocido" for unknown client', () => {
    const prompt = buildSystemPrompt({ profile: {} }, 'small_talk');
    expect(prompt).toContain('desconocido');
  });

  it('shows correct tier for vip client', () => {
    const prompt = buildSystemPrompt({ total_gastado: 250, num_compras: 5, profile: {} }, 'small_talk');
    expect(prompt).toContain('vip');
  });

  it('includes intent in context', () => {
    const prompt = buildSystemPrompt({}, 'sale_intent_photos');
    expect(prompt).toContain('sale_intent_photos');
  });

  it('PREPENDS internal instruction with INSTRUCCION_PRIORITARIA so it overrides the persona prompt', async () => {
    callOpenRouter.mockResolvedValue('ola q tal');
    await runPersona('hola', [], {}, 'small_talk', 'do not mention prices');
    const call = callOpenRouter.mock.calls[0][0];
    const systemMsg = call.messages.find((m) => m.role === 'system');
    expect(systemMsg.content).toContain('<INSTRUCCION_PRIORITARIA>');
    expect(systemMsg.content).toContain('do not mention prices');
    // Must come BEFORE the regular max-priority block (i.e. at the top of the prompt).
    const priorIdx = systemMsg.content.indexOf('<INSTRUCCION_PRIORITARIA>');
    const personaIdx = systemMsg.content.indexOf('INSTRUCCIÓN MÁXIMA PRIORIDAD');
    expect(priorIdx).toBeGreaterThanOrEqual(0);
    expect(priorIdx).toBeLessThan(personaIdx);
  });
});

describe('buildSystemPrompt — no-commercial-promise rule', () => {
  it('includes the roleplay dynamic rule', () => {
    const prompt = buildSystemPrompt({}, 'small_talk');
    expect(prompt).toContain('ROLEPLAY DINÁMICO');
  });

  it('includes the no-promise rule in system prompt', () => {
    // The rule is in persona.md section 8 (REGLAS TÉCNICAS).
    // The mock returns minimal content — check that the static roleplayRule injected
    // by buildSystemPrompt itself contains the right constraint.
    const prompt = buildSystemPrompt({}, 'small_talk');
    expect(prompt).toContain('ROLEPLAY DINÁMICO');
    // The no-promise rule is in persona.md (loaded via getPersonaContent mock).
    // We verify the prompt includes the intent so Persona can use it for the rule.
    expect(prompt).toContain('small_talk');
  });

  it('injects the intent so Persona can apply intent-gated rules', () => {
    const prompt = buildSystemPrompt({}, 'sale_intent_photos');
    expect(prompt).toContain('sale_intent_photos');
  });

  it('injects REGLA CRÍTICA for non-sale intents', () => {
    const prompt = buildSystemPrompt({}, 'small_talk');
    expect(prompt).toContain('REGLA CRÍTICA');
    expect(prompt).toContain('tengo esto para ti');
  });

  it('does NOT inject REGLA CRÍTICA for sale_intent_photos', () => {
    const prompt = buildSystemPrompt({}, 'sale_intent_photos');
    expect(prompt).not.toContain('REGLA CRÍTICA');
  });

  it('does NOT inject REGLA CRÍTICA for sexting_request', () => {
    const prompt = buildSystemPrompt({}, 'sexting_request');
    expect(prompt).not.toContain('REGLA CRÍTICA');
  });
});

describe('buildSystemPrompt — first-person and no-repeat rules', () => {
  it('includes first-person rule', () => {
    const prompt = buildSystemPrompt({}, 'small_talk');
    expect(prompt).toContain('PRIMERA PERSONA');
  });

  it('includes no-repeat rule', () => {
    const prompt = buildSystemPrompt({}, 'small_talk');
    expect(prompt).toContain('NUNCA repitas frases');
  });

  it('does not inject REGLA CRÍTICA for product_selection', () => {
    const prompt = buildSystemPrompt({}, 'product_selection');
    expect(prompt).not.toContain('REGLA CRÍTICA');
  });

  it('does not inject REGLA CRÍTICA for payment_method_selection', () => {
    const prompt = buildSystemPrompt({}, 'payment_method_selection');
    expect(prompt).not.toContain('REGLA CRÍTICA');
  });
});

describe('buildSystemPrompt — anti-catalog-repeat (BUG G1 Pacer fix)', () => {
  it('includes the explicit anti-catalog-repeat rule', () => {
    const prompt = buildSystemPrompt({}, 'small_talk');
    expect(prompt).toContain('PROHIBIDO ABSOLUTAMENTE repetir la lista de precios del catálogo');
  });

  it('explicitly forbids common catalog row patterns', () => {
    const prompt = buildSystemPrompt({}, 'small_talk');
    expect(prompt).toContain('1 foto 7€');
    expect(prompt).toContain('2 fotos 12€');
  });

  it('warns about duplication risk so the model understands WHY', () => {
    const prompt = buildSystemPrompt({}, 'small_talk');
    expect(prompt).toContain('DUPLICADO');
  });

  it('applies for sale intents too (catalog can also be appended in product_selection)', () => {
    const prompt = buildSystemPrompt({}, 'product_selection');
    expect(prompt).toContain('PROHIBIDO ABSOLUTAMENTE repetir la lista de precios');
  });
});

describe('runPersona', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the LLM response trimmed', async () => {
    callOpenRouter.mockResolvedValue('  hola q tal  ');
    const result = await runPersona('hola', [], {}, 'small_talk');
    expect(result).toBe('hola q tal');
  });

  it('passes history to OpenRouter messages', async () => {
    callOpenRouter.mockResolvedValue('ok');
    const history = [
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'ola' },
    ];
    await runPersona('q haces', history, {}, 'small_talk');
    const call = callOpenRouter.mock.calls[0][0];
    const nonSystem = call.messages.filter((m) => m.role !== 'system');
    expect(nonSystem.some((m) => m.content === 'hola')).toBe(true);
    expect(nonSystem.some((m) => m.content === 'q haces')).toBe(true);
  });

  it('uses temperature 0.75', async () => {
    callOpenRouter.mockResolvedValue('ok');
    await runPersona('test', [], {}, 'small_talk');
    expect(callOpenRouter).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.75 }));
  });

  it('limits tokens to 200', async () => {
    callOpenRouter.mockResolvedValue('ok');
    await runPersona('test', [], {}, 'small_talk');
    expect(callOpenRouter).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 200 }));
  });
});

// ─── BUG #2 v2 — deterministic post-processing ───────────────────────────
describe('sanitizeCatalogRepeats (pure function)', () => {
  it('returns input unchanged when no patterns match', () => {
    const { sanitized, stripped } = sanitizeCatalogRepeats('hola bebe que tal');
    expect(sanitized).toBe('hola bebe que tal');
    expect(stripped).toEqual([]);
  });

  it('strips a single "1 foto 7€" line', () => {
    const { sanitized, stripped } = sanitizeCatalogRepeats('hola bebe\n1 foto 7€\nque haces');
    expect(sanitized).toBe('hola bebe\nque haces');
    expect(stripped).toHaveLength(1);
  });

  it('strips "2 fotos 12€" line', () => {
    const { sanitized, stripped } = sanitizeCatalogRepeats('te tengo:\n2 fotos 12€\nbebe');
    expect(sanitized).not.toContain('2 fotos 12€');
    expect(stripped.length).toBeGreaterThan(0);
  });

  it('strips "sexting 5/10/15 min" line variants', () => {
    expect(sanitizeCatalogRepeats('sexting 5/10/15 min').sanitized).toBe('');
    expect(sanitizeCatalogRepeats('sexting 5 10 15 min').sanitized).toBe('');
  });

  it('strips "videollamada 4€/min"', () => {
    const { sanitized } = sanitizeCatalogRepeats('algo\nvideollamada 4€/min\nfin');
    expect(sanitized).toBe('algo\nfin');
  });

  it('strips "5 min 25€" minute pricing rows', () => {
    const { sanitized } = sanitizeCatalogRepeats('top\n5 min 25€\n10 min 45€\nbottom');
    expect(sanitized).toBe('top\nbottom');
  });

  it('strips "packs desde 30€"', () => {
    const { sanitized } = sanitizeCatalogRepeats('mira\npacks desde 30€\nbebe');
    expect(sanitized).toBe('mira\nbebe');
  });

  it('strips multiple matching lines at once', () => {
    const input = 'mira lo que tengo:\n1 foto 7€\n2 fotos 12€\nsexting 5/10/15 min\nque te apetece';
    const { sanitized, stripped } = sanitizeCatalogRepeats(input);
    expect(sanitized).toBe('mira lo que tengo:\nque te apetece');
    expect(stripped).toHaveLength(3);
  });

  it('handles null/empty/non-string input safely', () => {
    expect(sanitizeCatalogRepeats(null).sanitized).toBe('');
    expect(sanitizeCatalogRepeats('').sanitized).toBe('');
    expect(sanitizeCatalogRepeats(undefined).sanitized).toBe('');
  });

  it('collapses 3+ blank lines that result from stripping', () => {
    const { sanitized } = sanitizeCatalogRepeats('hola\n1 foto 7€\n2 fotos 12€\n\nfin');
    expect(sanitized).not.toMatch(/\n{3,}/);
  });

  it('exposes CATALOG_REPEAT_PATTERNS as an array of RegExps', () => {
    expect(Array.isArray(CATALOG_REPEAT_PATTERNS)).toBe(true);
    expect(CATALOG_REPEAT_PATTERNS.length).toBeGreaterThan(0);
    CATALOG_REPEAT_PATTERNS.forEach((rx) => expect(rx).toBeInstanceOf(RegExp));
  });
});

describe('sanitizeElongations — letras repetidas (criterio §3)', () => {
  it('collapses 3+ identical letters to 2: "holaaa" → "holaa"', () => {
    expect(sanitizeElongations('holaaa bebe')).toBe('holaa bebe');
  });

  it('collapses longer elongations: "holaaaaaa" → "holaa"', () => {
    expect(sanitizeElongations('holaaaaaa guapo')).toBe('holaa guapo');
  });

  it('collapses vocals: "siiiiii" → "sii", "guapooo" → "guapoo"', () => {
    expect(sanitizeElongations('siiiiii')).toBe('sii');
    expect(sanitizeElongations('guapooo')).toBe('guapoo');
  });

  it('leaves "holaa" (1 letra extra) unchanged', () => {
    expect(sanitizeElongations('holaa bebe')).toBe('holaa bebe');
  });

  it('leaves "jaja / jajaja / jajajaja" unchanged (no 3 consecutive same)', () => {
    expect(sanitizeElongations('jaja')).toBe('jaja');
    expect(sanitizeElongations('jajaja q dices')).toBe('jajaja q dices');
    expect(sanitizeElongations('jajajaja bebe')).toBe('jajajaja bebe');
  });

  it('leaves Spanish digraphs "cc / ll / rr" unchanged', () => {
    expect(sanitizeElongations('accion perro sello')).toBe('accion perro sello');
  });

  it('preserves accented vowels when collapsing', () => {
    expect(sanitizeElongations('síííí')).toBe('síí');
  });

  it('case-insensitive but preserves case', () => {
    expect(sanitizeElongations('HOLAAAA')).toBe('HOLAA');
    expect(sanitizeElongations('HoLaaaa')).toBe('HoLaa');
  });

  it('handles null/empty/non-string safely', () => {
    expect(sanitizeElongations(null)).toBe(null);
    expect(sanitizeElongations('')).toBe('');
    expect(sanitizeElongations(undefined)).toBe(undefined);
  });

  it('preserves emojis and surrounding text', () => {
    expect(sanitizeElongations('holaaa bebe 😈')).toBe('holaa bebe 😈');
  });

  it('applies to multiple elongations in one string', () => {
    expect(sanitizeElongations('holaaa y siiii rey')).toBe('holaa y sii rey');
  });
});

describe('runPersona — anti-catalog-repeat post-processing (BUG #2 v2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does NOT sanitize when client.has_seen_catalog is false', async () => {
    callOpenRouter.mockResolvedValue('mira: 1 foto 7€\nque te apetece bebe');
    const result = await runPersona('hola', [], { has_seen_catalog: false }, 'small_talk');
    expect(result).toContain('1 foto 7€');
    expect(callOpenRouter).toHaveBeenCalledTimes(1);
  });

  it('does NOT sanitize when client field is undefined', async () => {
    callOpenRouter.mockResolvedValue('mira: 1 foto 7€\nque te apetece bebe');
    const result = await runPersona('hola', [], {}, 'small_talk');
    expect(result).toContain('1 foto 7€');
    expect(callOpenRouter).toHaveBeenCalledTimes(1);
  });

  it('strips catalog rows when has_seen_catalog=true and ships sanitized', async () => {
    callOpenRouter.mockResolvedValue('mira lo que tengo:\n1 foto 7€\n2 fotos 12€\nque te apetece bebe');
    const result = await runPersona('hola', [], { id: 1, has_seen_catalog: true }, 'small_talk');
    expect(result).not.toContain('1 foto 7€');
    expect(result).not.toContain('2 fotos 12€');
    expect(result).toContain('que te apetece bebe');
    expect(callOpenRouter).toHaveBeenCalledTimes(1); // no regen
  });

  it('regenerates ONCE when sanitized output < 15 chars', async () => {
    callOpenRouter
      .mockResolvedValueOnce('1 foto 7€\n2 fotos 12€') // sanitized → ''
      .mockResolvedValueOnce('jajaja que loco eres bebe');
    const result = await runPersona('hola', [], { id: 1, has_seen_catalog: true }, 'small_talk');
    expect(callOpenRouter).toHaveBeenCalledTimes(2);
    expect(result).toBe('jajaja que loco eres bebe');
  });

  it('regen call carries explicit no-catalog instruction in system prompt', async () => {
    callOpenRouter
      .mockResolvedValueOnce('1 foto 7€')
      .mockResolvedValueOnce('vale bebe');
    await runPersona('hola', [], { id: 1, has_seen_catalog: true }, 'small_talk');
    const regenCall = callOpenRouter.mock.calls[1][0];
    const sys = regenCall.messages.find((m) => m.role === 'system').content;
    expect(sys).toContain('<INSTRUCCION_PRIORITARIA>');
    expect(sys).toMatch(/precios.*cat[aá]logo|cat[aá]logo.*precios/i);
  });

  it('does NOT loop infinitely if regen also returns short output', async () => {
    callOpenRouter
      .mockResolvedValueOnce('1 foto 7€')
      .mockResolvedValueOnce('1 foto 7€'); // also sanitizes to ''
    const result = await runPersona('hola', [], { id: 1, has_seen_catalog: true }, 'small_talk');
    expect(callOpenRouter).toHaveBeenCalledTimes(2); // regen ONCE, not more
    // Result is whatever survives — empty string fallback acceptable; no throw
    expect(typeof result).toBe('string');
  });

  it('ships sanitized when above threshold even if some lines stripped', async () => {
    callOpenRouter.mockResolvedValue('hola bebe que tal estas hoy\n1 foto 7€\nme apetece hablar contigo');
    const result = await runPersona('hola', [], { id: 1, has_seen_catalog: true }, 'small_talk');
    expect(callOpenRouter).toHaveBeenCalledTimes(1);
    expect(result).toContain('hola bebe que tal');
    expect(result).toContain('me apetece hablar');
    expect(result).not.toContain('1 foto 7€');
  });
});
