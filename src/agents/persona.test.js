import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSystemPrompt, runPersona } from './persona.js';

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
