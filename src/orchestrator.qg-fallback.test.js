import { describe, it, expect } from 'vitest';
import { resolveQualityGateFinalResponse } from './orchestrator.js';
import { BIO_LEAK_REASON, EMPTY_QUESTION_REASON } from './agents/quality-gate.js';

// ─── FIX A — empty_question must not fall back to safeResponse ──────────────
//
// Rationale: Quality Gate retry loop logic. When QG rejects with
// empty_question and both retries also fail, the previous behaviour returned
// qgN.safeResponse ("uf espera que me ha llegado algo 😅") — an evasive
// filler that destroys fuzz accuracy and breaks conversation flow. The new
// policy returns the original personaResponse instead; even a bare question
// is strictly better than derailing the conversation.

describe('resolveQualityGateFinalResponse — retry succeeded', () => {
  it('returns retryResponse when qgN.ok is true', () => {
    const out = resolveQualityGateFinalResponse({
      qg1: { ok: false, reason: EMPTY_QUESTION_REASON },
      qgN: { ok: true },
      personaResponse: 'original persona reply',
      retryResponse:   'retry reply that passed QG',
      clientId: 1,
    });
    expect(out).toBe('retry reply that passed QG');
  });

  it('prefers retryResponse over personaResponse when qgN.ok', () => {
    const out = resolveQualityGateFinalResponse({
      qg1: { ok: false, reason: 'some_other_reason' },
      qgN: { ok: true, safeResponse: 'SHOULD NOT BE USED' },
      personaResponse: 'persona',
      retryResponse:   'retry',
      clientId: 1,
    });
    expect(out).toBe('retry');
  });
});

describe('resolveQualityGateFinalResponse — empty_question fallback (FIX A)', () => {
  it('falls back to personaResponse when qg1.reason === empty_question and retries fail', () => {
    const out = resolveQualityGateFinalResponse({
      qg1: { ok: false, reason: EMPTY_QUESTION_REASON },
      qgN: { ok: false, reason: EMPTY_QUESTION_REASON, safeResponse: 'uf espera que me ha llegado algo 😅' },
      personaResponse: 'mmm qué te mola bebe',
      retryResponse:   'dime lo que quieres',
      clientId: 42,
    });
    expect(out).toBe('mmm qué te mola bebe');
    expect(out).not.toBe('uf espera que me ha llegado algo 😅');
  });

  it('falls back to personaResponse even when qgN.reason is different (qg1 is authoritative for this path)', () => {
    const out = resolveQualityGateFinalResponse({
      qg1: { ok: false, reason: EMPTY_QUESTION_REASON },
      qgN: { ok: false, reason: 'other_reason', safeResponse: 'fallback' },
      personaResponse: 'original persona text with empty question',
      retryResponse:   'retry',
      clientId: 1,
    });
    expect(out).toBe('original persona text with empty question');
  });

  it('does NOT use safeResponse when empty_question is the qg1 reason', () => {
    const out = resolveQualityGateFinalResponse({
      qg1: { ok: false, reason: EMPTY_QUESTION_REASON },
      qgN: { ok: false, safeResponse: 'EVASIVE FILLER' },
      personaResponse: 'real persona reply',
      retryResponse:   'retry reply',
      clientId: 1,
    });
    expect(out).not.toContain('EVASIVE FILLER');
  });
});

describe('resolveQualityGateFinalResponse — other failures use safeResponse (legacy)', () => {
  it('falls back to safeResponse when qg1.reason is bot_confession (legacy)', () => {
    const out = resolveQualityGateFinalResponse({
      qg1: { ok: false, reason: 'bot_confession' },
      qgN: { ok: false, reason: 'bot_confession', safeResponse: 'espera bebe, ahora mismo te contesto 😘' },
      personaResponse: 'soy una IA entrenada por OpenAI',
      retryResponse:   'soy un bot',
      clientId: 1,
    });
    expect(out).toBe('espera bebe, ahora mismo te contesto 😘');
  });

  it('falls back to safeResponse when qg1.reason is an unknown reason', () => {
    const out = resolveQualityGateFinalResponse({
      qg1: { ok: false, reason: 'some_unknown_reason' },
      qgN: { ok: false, reason: 'some_unknown_reason', safeResponse: 'safe response text' },
      personaResponse: 'persona',
      retryResponse:   'retry',
      clientId: 1,
    });
    expect(out).toBe('safe response text');
  });

  it('defaults to "espera un momento" when no safeResponse is provided', () => {
    const out = resolveQualityGateFinalResponse({
      qg1: { ok: false, reason: 'whatever' },
      qgN: { ok: false, reason: 'whatever' },
      personaResponse: 'persona',
      retryResponse:   'retry',
      clientId: 1,
    });
    expect(out).toBe('espera un momento');
  });
});

describe('resolveQualityGateFinalResponse — bio_leak path still sanitizes in-place', () => {
  it('sanitizes retryResponse in-place when qg1.reason is bio_leak', () => {
    const out = resolveQualityGateFinalResponse({
      qg1: { ok: false, reason: BIO_LEAK_REASON },
      qgN: { ok: false, reason: BIO_LEAK_REASON },
      personaResponse: 'estudio en la Complutense bebe',
      retryResponse:   'estudio en Moncloa bebe',
      clientId: 1,
    });
    // Should replace the forbidden term with "Madrid"
    expect(out).toBe('estudio en Madrid bebe');
  });

  it('sanitizes personaResponse when retryResponse is empty', () => {
    const out = resolveQualityGateFinalResponse({
      qg1: { ok: false, reason: BIO_LEAK_REASON },
      qgN: { ok: false, reason: BIO_LEAK_REASON },
      personaResponse: 'vivo en Argüelles',
      retryResponse:   '',
      clientId: 1,
    });
    expect(out).toBe('vivo en Madrid');
  });

  it('bio_leak path wins over empty_question when both could apply', () => {
    const out = resolveQualityGateFinalResponse({
      qg1: { ok: false, reason: BIO_LEAK_REASON },
      qgN: { ok: false, reason: EMPTY_QUESTION_REASON, safeResponse: 'safe' },
      personaResponse: 'estudio en UAM',
      retryResponse:   'estudio en UAM',
      clientId: 1,
    });
    // bio_leak in qg1 should trigger sanitization, not empty_question fallback
    expect(out).toBe('estudio en Madrid');
  });
});

describe('resolveQualityGateFinalResponse — edge cases', () => {
  it('handles missing qgN gracefully (defensive)', () => {
    const out = resolveQualityGateFinalResponse({
      qg1: { ok: false, reason: 'x' },
      qgN: undefined,
      personaResponse: 'p',
      retryResponse:   'r',
      clientId: 1,
    });
    expect(out).toBe('espera un momento');
  });

  it('empty_question with undefined personaResponse does not crash', () => {
    const out = resolveQualityGateFinalResponse({
      qg1: { ok: false, reason: EMPTY_QUESTION_REASON },
      qgN: { ok: false },
      personaResponse: undefined,
      retryResponse:   'retry',
      clientId: 1,
    });
    expect(out).toBeUndefined();
  });
});
