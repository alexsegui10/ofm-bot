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

  it.each([
    'ask_video_list', 'ask_video_details', 'ask_pack_list',
    'choose_video', 'choose_pack', 'buy_single_photos', 'buy_sexting_template',
  ])('accepts v2 intent %s', (intent) => {
    const raw = `{"intent":"${intent}","confidence":0.9,"fraud_score":0,"reasoning":"x"}`;
    const r = parseRouterOutput(raw);
    expect(r.intent).toBe(intent);
  });

  it('returns empty params object when missing', () => {
    const raw = '{"intent":"small_talk","confidence":0.9,"fraud_score":0,"reasoning":"x"}';
    const r = parseRouterOutput(raw);
    expect(r.params).toEqual({});
  });

  it('extracts buy_single_photos params (tag + count)', () => {
    const raw = '{"intent":"buy_single_photos","confidence":0.9,"fraud_score":0,"reasoning":"x","params":{"tag":"culo","count":2}}';
    const r = parseRouterOutput(raw);
    expect(r.params).toEqual({ tag: 'culo', count: 2 });
  });

  it('lowercases tag and floors count for buy_single_photos', () => {
    const raw = '{"intent":"buy_single_photos","confidence":0.9,"fraud_score":0,"reasoning":"x","params":{"tag":"TETAS","count":3.7}}';
    const r = parseRouterOutput(raw);
    expect(r.params).toEqual({ tag: 'tetas', count: 3 });
  });

  it('drops invalid count (out of 1-10 range) for buy_single_photos', () => {
    const raw = '{"intent":"buy_single_photos","confidence":0.9,"fraud_score":0,"reasoning":"x","params":{"tag":"culo","count":99}}';
    const r = parseRouterOutput(raw);
    expect(r.params).toEqual({ tag: 'culo' });
  });

  it('extracts choose_video params (product_id)', () => {
    const raw = '{"intent":"choose_video","confidence":0.9,"fraud_score":0,"reasoning":"x","params":{"product_id":"v_001"}}';
    const r = parseRouterOutput(raw);
    expect(r.params).toEqual({ product_id: 'v_001' });
  });

  it('extracts buy_sexting_template params (template_id)', () => {
    const raw = '{"intent":"buy_sexting_template","confidence":0.9,"fraud_score":0,"reasoning":"x","params":{"template_id":"st_10min"}}';
    const r = parseRouterOutput(raw);
    expect(r.params).toEqual({ template_id: 'st_10min' });
  });

  it('drops template_id outside the 3 allowed values', () => {
    const raw = '{"intent":"buy_sexting_template","confidence":0.9,"fraud_score":0,"reasoning":"x","params":{"template_id":"st_99min"}}';
    const r = parseRouterOutput(raw);
    expect(r.params).toEqual({});
  });

  it('drops params from non-v2 intents', () => {
    const raw = '{"intent":"sale_intent_photos","confidence":0.9,"fraud_score":0,"reasoning":"x","params":{"tag":"culo","count":2}}';
    const r = parseRouterOutput(raw);
    expect(r.params).toEqual({});
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

// ─── v2 prompt structure ──────────────────────────────────────────────────────
describe('Router SYSTEM_PROMPT — v2 priority + examples', () => {
  beforeEach(() => vi.clearAllMocks());

  it('declares v2 intents have PRIORIDAD MÁXIMA over sale_intent_*', () => {
    callAnthropic.mockResolvedValue('{"intent":"buy_single_photos","confidence":0.9,"fraud_score":0,"reasoning":"x","params":{"tag":"culo","count":2}}');
    return runRouter('quiero 2 fotos de culo', [], {}).then(() => {
      const system = callAnthropic.mock.calls[0][0].system;
      expect(system).toMatch(/PRIORIDAD MÁXIMA/);
      expect(system).toMatch(/buy_single_photos/);
    });
  });

  it.each([
    ['quiero 2 fotos de culo',          'buy_single_photos'],
    ['3 de tetas',                      'buy_single_photos'],
    ['dame una de lencería',            'buy_single_photos'],
    ['quiero el video del squirt',      'choose_video'],
    ['el de la ducha me mola',          'choose_video'],
    ['el video v_001',                  'choose_video'],
    ['quiero el pack de culo',          'choose_pack'],
    ['sexting 10 min',                  'buy_sexting_template'],
    ['quiero el de 5 min',              'buy_sexting_template'],
    ['5 min va',                        'buy_sexting_template'],
  ])('prompt contains example for "%s" → %s', (example, intent) => {
    callAnthropic.mockResolvedValue(`{"intent":"${intent}","confidence":0.9,"fraud_score":0,"reasoning":"x","params":{}}`);
    return runRouter(example, [], {}).then(() => {
      const system = callAnthropic.mock.calls[0][0].system;
      // The prompt itself contains both the example string and the intent name.
      expect(system).toContain(example);
      expect(system).toContain(intent);
    });
  });

  it('declares params object format for v2 intents', () => {
    callAnthropic.mockResolvedValue('{"intent":"small_talk","confidence":0.9,"fraud_score":0,"reasoning":"x"}');
    return runRouter('hola', [], {}).then(() => {
      const system = callAnthropic.mock.calls[0][0].system;
      expect(system).toMatch(/params/);
      expect(system).toMatch(/template_id/);
      expect(system).toMatch(/product_id/);
      expect(system).toMatch(/tag/);
      expect(system).toMatch(/count/);
    });
  });
});
