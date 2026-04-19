import { describe, it, expect } from 'vitest';
import {
  isBotQuestion,
  BOT_QUESTION_PATTERN,
  IS_REAL_PATTERN,
  BOT_DENIAL_RESPONSES,
} from './orchestrator.js';

// ─── HIGH-ROI FIX #3 — "¿eres un bot?" short-circuit ────────────────────────

describe('isBotQuestion — prohibited probes (should return true)', () => {
  it('detects "eres un bot?"', () => {
    expect(isBotQuestion('eres un bot?')).toBe(true);
  });

  it('detects "¿eres un bot?" with opening question mark', () => {
    expect(isBotQuestion('¿eres un bot?')).toBe(true);
  });

  it('detects "eres una IA"', () => {
    expect(isBotQuestion('eres una IA')).toBe(true);
  });

  it('detects "eres un chatbot?"', () => {
    expect(isBotQuestion('eres un chatbot?')).toBe(true);
  });

  it('detects "eres un asistente virtual"', () => {
    expect(isBotQuestion('eres un asistente virtual?')).toBe(true);
  });

  it('detects "eres chatgpt"', () => {
    expect(isBotQuestion('eres chatgpt?')).toBe(true);
  });

  it('detects "eres gpt"', () => {
    expect(isBotQuestion('eres gpt?')).toBe(true);
  });

  it('detects "estoy hablando con un bot"', () => {
    expect(isBotQuestion('estoy hablando con un bot?')).toBe(true);
  });

  it('detects "esto lo escribe una IA"', () => {
    expect(isBotQuestion('esto lo escribe una ia?')).toBe(true);
  });

  it('detects "eres un robot"', () => {
    expect(isBotQuestion('eres un robot?')).toBe(true);
  });

  it('detects "eres real?"', () => {
    expect(isBotQuestion('eres real?')).toBe(true);
  });

  it('detects "eres humana?"', () => {
    expect(isBotQuestion('eres humana?')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isBotQuestion('ERES UN BOT?')).toBe(true);
    expect(isBotQuestion('Eres Una IA')).toBe(true);
  });

  it('detects "eres inteligencia artificial"', () => {
    expect(isBotQuestion('eres una inteligencia artificial?')).toBe(true);
  });

  it('detects "eres una máquina"', () => {
    expect(isBotQuestion('eres una máquina?')).toBe(true);
  });
});

describe('isBotQuestion — valid messages (should return false)', () => {
  it('does NOT flag "hola q tal"', () => {
    expect(isBotQuestion('hola q tal')).toBe(false);
  });

  it('does NOT flag "quiero fotos"', () => {
    expect(isBotQuestion('quiero fotos')).toBe(false);
  });

  it('does NOT flag "cómo estás?"', () => {
    expect(isBotQuestion('cómo estás?')).toBe(false);
  });

  it('does NOT flag "me robo tu corazón" (robot substring safety)', () => {
    expect(isBotQuestion('me robo tu corazón')).toBe(false);
  });

  it('does NOT flag "eres muy guapa"', () => {
    expect(isBotQuestion('eres muy guapa')).toBe(false);
  });

  it('does NOT flag "quiero bizum"', () => {
    expect(isBotQuestion('quiero bizum')).toBe(false);
  });

  it('does NOT flag empty string', () => {
    expect(isBotQuestion('')).toBe(false);
    expect(isBotQuestion(null)).toBe(false);
    expect(isBotQuestion(undefined)).toBe(false);
  });

  it('does NOT flag "programa tu visita"', () => {
    expect(isBotQuestion('programa tu visita')).toBe(false);
  });
});

describe('BOT_DENIAL_RESPONSES', () => {
  it('contains at least 3 responses', () => {
    expect(BOT_DENIAL_RESPONSES.length).toBeGreaterThanOrEqual(3);
  });

  it('all responses are non-empty strings', () => {
    for (const r of BOT_DENIAL_RESPONSES) {
      expect(typeof r).toBe('string');
      expect(r.length).toBeGreaterThan(0);
    }
  });

  it('none of the responses confirm being a bot', () => {
    for (const r of BOT_DENIAL_RESPONSES) {
      expect(/\bsoy\s+(un\s+)?bot\b/i.test(r)).toBe(false);
      expect(/\bsoy\s+(una\s+)?ia\b/i.test(r)).toBe(false);
    }
  });
});

describe('regex exports', () => {
  it('BOT_QUESTION_PATTERN is a RegExp', () => {
    expect(BOT_QUESTION_PATTERN).toBeInstanceOf(RegExp);
  });

  it('IS_REAL_PATTERN is a RegExp', () => {
    expect(IS_REAL_PATTERN).toBeInstanceOf(RegExp);
  });
});
