import { describe, it, expect, vi, beforeEach } from 'vitest';
import { quickCheck, buildQualityGatePrompt, runQualityGate, FORBIDDEN_BIO_LEAK, BIO_LEAK_REASON, isEmptyQuestion, EMPTY_QUESTION_REASON } from './quality-gate.js';

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

// ─── BUG CRÍTICO #3: bio leak (universidades / barrios Madrid) ─────────────────

describe('FORBIDDEN_BIO_LEAK regex', () => {
  it('matches Complutense (case-insensitive)', () => {
    expect(FORBIDDEN_BIO_LEAK.test('estudio en la complutense bebe')).toBe(true);
    expect(FORBIDDEN_BIO_LEAK.test('estudié en la COMPLUTENSE')).toBe(true);
  });

  it('matches Moncloa', () => {
    expect(FORBIDDEN_BIO_LEAK.test('vivo en moncloa')).toBe(true);
  });

  it('matches UAM and Autónoma', () => {
    expect(FORBIDDEN_BIO_LEAK.test('voy a la uam')).toBe(true);
    expect(FORBIDDEN_BIO_LEAK.test('estoy en la autónoma de madrid')).toBe(true);
    expect(FORBIDDEN_BIO_LEAK.test('autonoma sin tilde también')).toBe(true);
  });

  it('matches Carlos III with optional spaces', () => {
    expect(FORBIDDEN_BIO_LEAK.test('soy de carlos iii')).toBe(true);
    expect(FORBIDDEN_BIO_LEAK.test('la carlosiii está cerca')).toBe(true);
  });

  it('matches Rey Juan Carlos', () => {
    expect(FORBIDDEN_BIO_LEAK.test('estudio en la rey juan carlos')).toBe(true);
  });

  it('matches Cuatro Caminos', () => {
    expect(FORBIDDEN_BIO_LEAK.test('paso por cuatro caminos cada día')).toBe(true);
    expect(FORBIDDEN_BIO_LEAK.test('vivo cerca de cuátrocaminos')).toBe(true);
  });

  it('matches Argüelles with and without diaeresis', () => {
    expect(FORBIDDEN_BIO_LEAK.test('barrio argüelles')).toBe(true);
    expect(FORBIDDEN_BIO_LEAK.test('barrio arguelles también')).toBe(true);
  });

  it('does NOT match unrelated text', () => {
    expect(FORBIDDEN_BIO_LEAK.test('estudio en madrid bebe')).toBe(false);
    expect(FORBIDDEN_BIO_LEAK.test('voy a la facultad por la mañana')).toBe(false);
    expect(FORBIDDEN_BIO_LEAK.test('soy del centro de la capital')).toBe(false);
  });
});

describe('quickCheck — bio_leak detection', () => {
  it('flags Complutense in any intent', () => {
    const reason = quickCheck('estudio en la complutense', 'small_talk');
    expect(reason).toBe(BIO_LEAK_REASON);
  });

  it('flags Moncloa in product_selection too (intent-agnostic)', () => {
    const reason = quickCheck('vivo en moncloa cerca de la facultad', 'product_selection');
    expect(reason).toBe(BIO_LEAK_REASON);
  });

  it('flags UAM in sexting_request', () => {
    const reason = quickCheck('estudio en la uam bebe', 'sexting_request');
    expect(reason).not.toBeNull();
  });

  it('returns null for safe answers like "estudio en madrid"', () => {
    expect(quickCheck('estudio en madrid bebe', 'small_talk')).toBeNull();
  });

  it('exposes BIO_LEAK_REASON for orchestrator routing', () => {
    expect(typeof BIO_LEAK_REASON).toBe('string');
    expect(BIO_LEAK_REASON.length).toBeGreaterThan(0);
  });
});

describe('runQualityGate — bio_leak short-circuit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks "estudio en la complutense" via quickCheck (no LLM call)', async () => {
    const result = await runQualityGate('estudio en la complutense', {}, 'small_talk');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(BIO_LEAK_REASON);
    expect(callAnthropic).not.toHaveBeenCalled();
  });

  it('blocks "vivo en moncloa" via quickCheck regardless of intent', async () => {
    const result = await runQualityGate('vivo en moncloa', {}, 'product_selection');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(BIO_LEAK_REASON);
  });
});

// ─── BUG #3 v2: diminutivos (complu, la complu, etc.) ──────────────────────
describe('FORBIDDEN_BIO_LEAK — diminutives (BUG #3 v2)', () => {
  it('matches bare "complu"', () => {
    expect(FORBIDDEN_BIO_LEAK.test('estudio en la complu')).toBe(true);
  });

  it('matches "complu" with surrounding punctuation', () => {
    expect(FORBIDDEN_BIO_LEAK.test('voy a la complu, te cuento')).toBe(true);
    expect(FORBIDDEN_BIO_LEAK.test('la complu. me encanta')).toBe(true);
    expect(FORBIDDEN_BIO_LEAK.test('estoy en la complu!')).toBe(true);
  });

  it('matches uppercase "COMPLU"', () => {
    expect(FORBIDDEN_BIO_LEAK.test('LA COMPLU es enorme')).toBe(true);
  });

  it('still matches the full "complutense"', () => {
    expect(FORBIDDEN_BIO_LEAK.test('estudio en la complutense bebe')).toBe(true);
    expect(FORBIDDEN_BIO_LEAK.test('Complutense de Madrid')).toBe(true);
  });

  it('matches "complu" mid-sentence after a verb', () => {
    expect(FORBIDDEN_BIO_LEAK.test('estudio complu')).toBe(true);
    expect(FORBIDDEN_BIO_LEAK.test('iba a la complu cada día')).toBe(true);
  });

  it('matches mixed-case "Complu"', () => {
    expect(FORBIDDEN_BIO_LEAK.test('Complu rules')).toBe(true);
  });

  it('does NOT match unrelated words containing "compl-" prefix', () => {
    expect(FORBIDDEN_BIO_LEAK.test('es muy complejo bebe')).toBe(false);
    expect(FORBIDDEN_BIO_LEAK.test('te complemento')).toBe(false);
    expect(FORBIDDEN_BIO_LEAK.test('cumplo años mañana')).toBe(false);
    expect(FORBIDDEN_BIO_LEAK.test('quiero un complemento')).toBe(false);
    expect(FORBIDDEN_BIO_LEAK.test('todo complicado hoy')).toBe(false);
  });

  it('does NOT match "completo" or "compleja"', () => {
    expect(FORBIDDEN_BIO_LEAK.test('está todo completo')).toBe(false);
    expect(FORBIDDEN_BIO_LEAK.test('una pregunta compleja')).toBe(false);
  });

  it('quickCheck flags "la complu" intent-agnostic', () => {
    expect(quickCheck('estudio en la complu', 'small_talk')).toBe(BIO_LEAK_REASON);
    expect(quickCheck('voy a la complu hoy', 'sexting_request')).toBe(BIO_LEAK_REASON);
    expect(quickCheck('me ves en la complu?', 'product_selection')).toBe(BIO_LEAK_REASON);
  });

  it('runQualityGate short-circuits on "complu" without LLM call', async () => {
    const result = await runQualityGate('te veo luego en la complu bebe', {}, 'small_talk');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(BIO_LEAK_REASON);
    expect(callAnthropic).not.toHaveBeenCalled();
  });
});

// ─── HIGH-ROI FIX #2: empty question detector ────────────────────────────────

describe('isEmptyQuestion — prohibited patterns (should return true)', () => {
  it('detects "dime qué te mola"', () => {
    expect(isEmptyQuestion('dime qué te mola')).toBe(true);
  });

  it('detects "dime que te mola rey 🔥" with emoji', () => {
    expect(isEmptyQuestion('dime que te mola 🔥')).toBe(true);
  });

  it('detects "qué prefieres?"', () => {
    expect(isEmptyQuestion('qué prefieres?')).toBe(true);
  });

  it('detects "qué te apetece"', () => {
    expect(isEmptyQuestion('qué te apetece')).toBe(true);
  });

  it('detects "qué te apetece ver"', () => {
    expect(isEmptyQuestion('qué te apetece ver')).toBe(true);
  });

  it('detects "cuál te gusta más?"', () => {
    expect(isEmptyQuestion('cuál te gusta más?')).toBe(true);
  });

  it('detects "qué quieres ver?"', () => {
    expect(isEmptyQuestion('qué quieres ver?')).toBe(true);
  });

  it('detects "qué buscas?"', () => {
    expect(isEmptyQuestion('qué buscas?')).toBe(true);
  });

  it('detects empty question on last line only (multi-line response)', () => {
    const resp = 'hola bebe\n\nqué te apetece 😈';
    expect(isEmptyQuestion(resp)).toBe(true);
  });

  it('detects "dime qué te pone" variant', () => {
    expect(isEmptyQuestion('dime qué te pone 🥵')).toBe(true);
  });
});

describe('isEmptyQuestion — valid responses (should return false)', () => {
  it('accepts response with concrete options (prices + tags)', () => {
    const resp = 'tengo fotos de culo desde 7€, tetas desde 5€ o pack completo 25€. qué te mola?';
    expect(isEmptyQuestion(resp)).toBe(false);
  });

  it('accepts response offering sexting tiers', () => {
    const resp = 'sexting 5min 5€, 10min 10€, 15min 15€. cuál te apetece?';
    expect(isEmptyQuestion(resp)).toBe(false);
  });

  it('accepts response with product id', () => {
    const resp = 'mira el v_001 que lo tengo nuevo. qué buscas?';
    expect(isEmptyQuestion(resp)).toBe(false);
  });

  it('accepts declarative response without question', () => {
    expect(isEmptyQuestion('jaja claro bebe, me encanta')).toBe(false);
  });

  it('accepts response with explicit tag option', () => {
    const resp = 'dime qué te mola más, tetas o culo?';
    expect(isEmptyQuestion(resp)).toBe(false);
  });
});

describe('quickCheck — empty question integration', () => {
  it('flags empty question on catalog_question intent', () => {
    expect(quickCheck('dime qué te mola', 'catalog_question')).toBe(EMPTY_QUESTION_REASON);
  });

  it('flags empty question on sale_intent_photos', () => {
    expect(quickCheck('qué prefieres?', 'sale_intent_photos')).toBe(EMPTY_QUESTION_REASON);
  });

  it('flags empty question when intent is undefined', () => {
    expect(quickCheck('qué te apetece 🔥')).toBe(EMPTY_QUESTION_REASON);
  });

  it('SKIPS empty question on small_talk intent', () => {
    expect(quickCheck('dime qué te mola', 'small_talk')).toBeNull();
  });

  it('SKIPS empty question on sexting_active intent', () => {
    expect(quickCheck('qué te apetece 😈', 'sexting_active')).toBeNull();
  });

  it('SKIPS empty question on payment_confirmation intent', () => {
    expect(quickCheck('qué prefieres?', 'payment_confirmation')).toBeNull();
  });

  it('does NOT flag response with concrete options', () => {
    const resp = 'tengo fotos desde 7€ bebe. qué te mola?';
    expect(quickCheck(resp, 'catalog_question')).toBeNull();
  });

  it('EMPTY_QUESTION_REASON is a non-empty string', () => {
    expect(typeof EMPTY_QUESTION_REASON).toBe('string');
    expect(EMPTY_QUESTION_REASON.length).toBeGreaterThan(0);
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
