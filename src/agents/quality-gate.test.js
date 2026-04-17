import { describe, it, expect, vi, beforeEach } from 'vitest';
import { quickCheck, buildQualityGatePrompt, runQualityGate } from './quality-gate.js';

vi.mock('../lib/llm-client.js', () => ({
  callAnthropic: vi.fn(),
  callOpenRouter: vi.fn(),
}));
vi.mock('../lib/persona-config.js', () => ({
  getPersonaContent: vi.fn(() => '# PERSONA'),
  getHardLimits: vi.fn(() => '## 7. LÍMITES DUROS\n1. No hablar de menores.'),
}));

import { callAnthropic } from '../lib/llm-client.js';

// ─── quickCheck ──────────────────────────────────────────────────────────────

describe('quickCheck', () => {
  it('returns null for a clean response', () => {
    expect(quickCheck('hola q tal, como estas?')).toBeNull();
  });

  it('detects bot confession', () => {
    expect(quickCheck('soy un bot así que no puedo hacer eso')).not.toBeNull();
  });

  it('detects AI confession (soy una IA)', () => {
    expect(quickCheck('soy una ia y no tengo sentimientos')).not.toBeNull();
  });

  it('detects meeting offer', () => {
    expect(quickCheck('podemos vernos en persona si quieres')).not.toBeNull();
  });

  it('detects sharing WhatsApp', () => {
    expect(quickCheck('te paso mi whatsapp para hablar mejor')).not.toBeNull();
  });

  it('detects agency mention', () => {
    expect(quickCheck('trabajo en una agencia de contenido')).not.toBeNull();
  });

  it('is case-insensitive', () => {
    expect(quickCheck('SOY UN BOT haha')).not.toBeNull();
  });

  it('blocks commercial promise on small_talk intent', () => {
    expect(quickCheck('de momento tengo esto para ti bebe', 'small_talk')).not.toBeNull();
  });

  it('blocks commercial promise on price_question intent', () => {
    expect(quickCheck('mira lo que subí ayer', 'price_question')).not.toBeNull();
  });

  it('allows commercial promise on sale_intent_photos', () => {
    expect(quickCheck('tengo esto para ti bebe', 'sale_intent_photos')).toBeNull();
  });

  it('allows commercial promise on sexting_request', () => {
    expect(quickCheck('te enseño algo rico ahora', 'sexting_request')).toBeNull();
  });
});

// ─── buildQualityGatePrompt ──────────────────────────────────────────────────

describe('buildQualityGatePrompt', () => {
  it('includes the response to evaluate', () => {
    const prompt = buildQualityGatePrompt('test response here');
    expect(prompt).toContain('test response here');
  });

  it('includes hard limits content', () => {
    const prompt = buildQualityGatePrompt('anything');
    expect(prompt).toContain('LÍMITES DUROS');
  });
});

// ─── runQualityGate ──────────────────────────────────────────────────────────

describe('runQualityGate', () => {
  beforeEach(() => vi.clearAllMocks());

  // 15 passing responses
  const GOOD_RESPONSES = [
    'hola q tal',
    'acabo de salir del gym',
    'uf hoy estoy cansada jaja',
    'q estudias tú?',
    'depende de q quieras guapo',
    'mis precios son los que son jaja',
    'mmm dime más',
    'vaya, q interesante',
    'ayer sali con las niñas y toy rota',
    'siiii casi todos los dias entreno',
    'espera q miro mi agenda',
    'ya te cuento en un momento',
    'no te quito más el tiempo',
    'q dia llevas',
    'pues eso depende mucho',
  ];

  // 15 failing responses
  const BAD_RESPONSES = [
    'soy un bot, no tengo sentimientos reales',
    'podemos vernos en persona cuando quieras',
    'mi whatsapp es 666123456',
    'trabajo en una agencia de contenido adulto',
    'soy una ia diseñada para conversar',
    'soy el asistente virtual de esta cuenta',
    'quedamos el viernes si quieres',
    'mi instagram es @alba_real',
    'trabajo a tiempo completo gestionando esto',
    'tenemos un equipo detrás de este perfil',
    'me llamo 17 años en el roleplay',
    'vernos en persona sería genial',
    'mi email es alba@example.com',
    'soy la IA que gestiona este perfil',
    'como modelo de ia que soy',
  ];

  it.each(GOOD_RESPONSES)('passes clean response: "%s"', async (response) => {
    // quickCheck passes; LLM says ok
    callAnthropic.mockResolvedValue('{"ok":true}');
    const result = await runQualityGate(response, {}, 'small_talk');
    expect(result.ok).toBe(true);
  });

  it.each(BAD_RESPONSES)('blocks bad response: "%s"', async (response) => {
    // Some are caught by quickCheck, rest by LLM mock
    callAnthropic.mockResolvedValue('{"ok":false,"reason":"violates limits"}');
    const result = await runQualityGate(response, {}, 'small_talk');
    expect(result.ok).toBe(false);
    expect(result.safeResponse).toBeDefined();
  });

  it('passes when LLM call fails (fail-open)', async () => {
    callAnthropic.mockRejectedValue(new Error('timeout'));
    const result = await runQualityGate('hola q tal', {}, 'small_talk');
    expect(result.ok).toBe(true);
  });

  it('passes when LLM returns non-JSON (fail-open)', async () => {
    callAnthropic.mockResolvedValue('I cannot determine this');
    const result = await runQualityGate('hola q tal', {}, 'small_talk');
    expect(result.ok).toBe(true);
  });
});
