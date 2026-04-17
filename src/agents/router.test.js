import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseRouterOutput, runRouter } from './router.js';

vi.mock('../lib/llm-client.js', () => ({
  callAnthropic: vi.fn(),
  callOpenRouter: vi.fn(),
}));

import { callAnthropic } from '../lib/llm-client.js';

describe('parseRouterOutput', () => {
  it('parses valid JSON correctly', () => {
    const raw = '{"intent":"small_talk","confidence":0.9,"fraud_score":0.0,"reasoning":"casual greeting"}';
    const r = parseRouterOutput(raw);
    expect(r.intent).toBe('small_talk');
    expect(r.confidence).toBe(0.9);
    expect(r.fraud_score).toBe(0);
  });

  it('strips markdown code blocks', () => {
    const raw = '```json\n{"intent":"price_question","confidence":0.8,"fraud_score":0.1,"reasoning":"asks price"}\n```';
    const r = parseRouterOutput(raw);
    expect(r.intent).toBe('price_question');
  });

  it('replaces unknown intent with small_talk', () => {
    const raw = '{"intent":"unknown_intent","confidence":0.9,"fraud_score":0,"reasoning":"x"}';
    const r = parseRouterOutput(raw);
    expect(r.intent).toBe('small_talk');
  });

  it('clamps confidence and fraud_score to 0-1', () => {
    const raw = '{"intent":"small_talk","confidence":1.5,"fraud_score":-0.2,"reasoning":"x"}';
    const r = parseRouterOutput(raw);
    expect(r.confidence).toBe(1);
    expect(r.fraud_score).toBe(0);
  });

  it('throws on completely invalid JSON', () => {
    expect(() => parseRouterOutput('not json at all')).toThrow();
  });

  it('accepts product_selection as valid intent', () => {
    const raw = '{"intent":"product_selection","confidence":0.9,"fraud_score":0,"reasoning":"chose product"}';
    const r = parseRouterOutput(raw);
    expect(r.intent).toBe('product_selection');
  });

  it('accepts payment_method_selection as valid intent', () => {
    const raw = '{"intent":"payment_method_selection","confidence":0.9,"fraud_score":0,"reasoning":"chose payment"}';
    const r = parseRouterOutput(raw);
    expect(r.intent).toBe('payment_method_selection');
  });
});

describe('runRouter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns parsed result on success', async () => {
    callAnthropic.mockResolvedValue('{"intent":"sale_intent_photos","confidence":0.95,"fraud_score":0.0,"reasoning":"wants photos"}');
    const r = await runRouter('quiero comprar fotos', [], {});
    expect(r.intent).toBe('sale_intent_photos');
    expect(r.confidence).toBe(0.95);
  });

  it('falls back to small_talk when confidence < 0.7', async () => {
    callAnthropic.mockResolvedValue('{"intent":"sexting_request","confidence":0.5,"fraud_score":0.1,"reasoning":"ambiguous"}');
    const r = await runRouter('hola', [], {});
    expect(r.intent).toBe('small_talk');
  });

  it('falls back to small_talk on LLM error', async () => {
    callAnthropic.mockRejectedValue(new Error('network error'));
    const r = await runRouter('hola', [], {});
    expect(r.intent).toBe('small_talk');
    expect(r.reasoning).toBe('llm_error');
  });

  it('falls back to small_talk on parse error', async () => {
    callAnthropic.mockResolvedValue('this is not json');
    const r = await runRouter('hola', [], {});
    expect(r.intent).toBe('small_talk');
    expect(r.reasoning).toBe('parse_error');
  });

  it('calls callAnthropic with temperature 0', async () => {
    callAnthropic.mockResolvedValue('{"intent":"small_talk","confidence":0.9,"fraud_score":0,"reasoning":"x"}');
    await runRouter('test', [], {});
    expect(callAnthropic).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0 }));
  });

  it('includes history in the prompt', async () => {
    callAnthropic.mockResolvedValue('{"intent":"small_talk","confidence":0.9,"fraud_score":0,"reasoning":"x"}');
    const history = [{ role: 'user', content: 'hola' }, { role: 'assistant', content: 'ola' }];
    await runRouter('test', history, {});
    const call = callAnthropic.mock.calls[0][0];
    expect(call.messages[0].content).toContain('hola');
  });
});

// ─── Commercial signal routing ────────────────────────────────────────────────
// These tests verify the SYSTEM_PROMPT contains the right rules — the LLM is
// mocked so we're testing prompt construction, not LLM behavior.

describe('Router SYSTEM_PROMPT — commercial signal rules', () => {
  it('prompt lists "venderme" as a sale_intent signal', () => {
    // Access the module to read SYSTEM_PROMPT indirectly via the call args
    callAnthropic.mockResolvedValue('{"intent":"sale_intent_photos","confidence":0.9,"fraud_score":0,"reasoning":"wants to buy"}');
    const promptCheck = async () => {
      await runRouter('qué tienes para venderme', [], {});
      const call = callAnthropic.mock.calls[0][0];
      return call.system;
    };
    return promptCheck().then((system) => {
      expect(system).toContain('venderme');
      expect(system).toContain('sale_intent');
    });
  });

  it('prompt rule: commercial signals override small_talk mixing', () => {
    callAnthropic.mockResolvedValue('{"intent":"sale_intent_photos","confidence":0.9,"fraud_score":0,"reasoning":"x"}');
    return runRouter('oye q tal, tienes fotos?', [], {}).then(() => {
      const system = callAnthropic.mock.calls[0][0].system;
      expect(system).toContain('sale_intent');
      expect(system).toContain('SEÑALES COMERCIALES');
    });
  });

  it('prompt mandates confidence ≥ 0.85 for commercial signals', () => {
    callAnthropic.mockResolvedValue('{"intent":"sale_intent_photos","confidence":0.9,"fraud_score":0,"reasoning":"x"}');
    return runRouter('cuánto cuesta', [], {}).then(() => {
      const system = callAnthropic.mock.calls[0][0].system;
      expect(system).toContain('0.85');
    });
  });

  it('prompt contains product_selection intent description', () => {
    callAnthropic.mockResolvedValue('{"intent":"product_selection","confidence":0.9,"fraud_score":0,"reasoning":"x"}');
    return runRouter('quiero el pack de fotos hard', [], {}).then(() => {
      const system = callAnthropic.mock.calls[0][0].system;
      expect(system).toContain('product_selection');
    });
  });

  it('prompt contains payment_method_selection intent description', () => {
    callAnthropic.mockResolvedValue('{"intent":"payment_method_selection","confidence":0.9,"fraud_score":0,"reasoning":"x"}');
    return runRouter('pago por bizum', [], {}).then(() => {
      const system = callAnthropic.mock.calls[0][0].system;
      expect(system).toContain('payment_method_selection');
    });
  });
});
