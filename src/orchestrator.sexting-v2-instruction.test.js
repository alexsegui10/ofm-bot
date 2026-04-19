import { describe, it, expect, vi } from 'vitest';

// Stub heavy modules pulled in by orchestrator.js so this test stays pure.
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

import { buildSextingV2Instruction, buildSextingKickoffInstruction } from './orchestrator.js';

describe('buildSextingV2Instruction', () => {
  const base = { phase: 'warm_up', clientState: 'engaged', roleplay: null };

  it('always declares the session is active and persona must not greet', () => {
    const out = buildSextingV2Instruction(base);
    expect(out).toMatch(/SESI[ÓO]N DE SEXTING ACTIVA/i);
    expect(out).toMatch(/SIN presentarte/);
  });

  it('forbids open questions like "qué quieres" / "qué necesitas" (BUG B — F2)', () => {
    const out = buildSextingV2Instruction(base);
    expect(out).toContain('TÚ DIRIGES');
    expect(out).toContain('qué quieres');
    expect(out).toContain('qué necesitas');
  });

  it('forbids confirming seeing client images (BUG B — F3)', () => {
    const out = buildSextingV2Instruction(base);
    expect(out).toMatch(/NUNCA confirmes ver im[aá]genes/i);
    expect(out).toContain('ya lo vi');
  });

  it('forbids mentioning catalog / prices / packs / templates', () => {
    const out = buildSextingV2Instruction(base);
    expect(out).toContain('NADA de catálogo');
    expect(out).toMatch(/precios/);
  });

  it('warm_up phase tells Persona to start the action, not ask', () => {
    const out = buildSextingV2Instruction({ ...base, phase: 'warm_up' });
    expect(out).toMatch(/warm_up/);
    expect(out).toMatch(/TÚ haces/);
    expect(out).toMatch(/NO preguntes nada/);
  });

  it('escalada phase signals "vas a tope, explícita"', () => {
    const out = buildSextingV2Instruction({ ...base, phase: 'escalada' });
    expect(out).toMatch(/escalada/);
    expect(out).toMatch(/expl[ií]cita/);
  });

  it('cool_down phase tells Persona to be tender and close', () => {
    const out = buildSextingV2Instruction({ ...base, phase: 'cool_down' });
    expect(out).toMatch(/cool_down/);
    expect(out).toMatch(/tierna/);
  });

  it('rushed clientState tells Persona to condense', () => {
    const out = buildSextingV2Instruction({ ...base, clientState: 'rushed' });
    expect(out).toMatch(/condensa/);
  });

  it('roleplay set: forbids asking setup questions like "qué asignatura" (F2)', () => {
    const out = buildSextingV2Instruction({ ...base, roleplay: 'profesora' });
    expect(out).toContain('profesora');
    expect(out).toMatch(/qué asignatura/);
    expect(out).toMatch(/NO preguntes detalles del setup/);
  });

  it('roleplay null: omits the roleplay line', () => {
    const out = buildSextingV2Instruction({ ...base, roleplay: null });
    expect(out).not.toMatch(/EN ROL/);
  });

  it('returns multi-line block (rules separated by newlines)', () => {
    const out = buildSextingV2Instruction(base);
    expect(out.split('\n').length).toBeGreaterThanOrEqual(4);
  });

  it('falls back to warm_up tone when phase is unknown', () => {
    const out = buildSextingV2Instruction({ phase: 'unknown', clientState: 'engaged', roleplay: null });
    expect(out).toMatch(/warm_up/);
  });
});

describe('buildSextingKickoffInstruction (FIX F1)', () => {
  it('declares this is a KICKOFF — client did not write yet', () => {
    const out = buildSextingKickoffInstruction({ roleplay: null, templateId: 'st_5min' });
    expect(out).toMatch(/KICKOFF/);
    expect(out).toMatch(/no ha escrito nada/i);
  });

  it('includes the template id so the persona can size the message', () => {
    const out = buildSextingKickoffInstruction({ roleplay: null, templateId: 'st_15min' });
    expect(out).toContain('st_15min');
  });

  it('forbids greeting and "vamos allá"-style payment ack', () => {
    const out = buildSextingKickoffInstruction({ roleplay: null, templateId: 'st_5min' });
    expect(out).toMatch(/Saludar/);
    expect(out).toMatch(/vamos all[áa]/i);
  });

  it('forbids open questions in the kickoff (TÚ DIRIGES)', () => {
    const out = buildSextingKickoffInstruction({ roleplay: null, templateId: 'st_5min' });
    expect(out).toMatch(/Preguntar al cliente/);
    expect(out).toMatch(/qu[eé] quieres/);
  });

  it('forbids commercial promises (no link, no price, no other content)', () => {
    const out = buildSextingKickoffInstruction({ roleplay: null, templateId: 'st_5min' });
    expect(out).toMatch(/precio/);
    expect(out).toMatch(/tengo esto\/algo para ti/);
  });

  it('reinforces ROL when roleplay is provided', () => {
    const out = buildSextingKickoffInstruction({ roleplay: 'profesora', templateId: 'st_5min' });
    expect(out).toMatch(/EN ROL "profesora"/);
    expect(out).toMatch(/no preguntes detalles del setup/i);
  });

  it('falls back to neutral Alba when roleplay is null', () => {
    const out = buildSextingKickoffInstruction({ roleplay: null, templateId: 'st_5min' });
    expect(out).toMatch(/Alba neutra/);
  });

  it('asks for warm_up phase tone (TÚ describes lo que sientes)', () => {
    const out = buildSextingKickoffInstruction({ roleplay: null, templateId: 'st_5min' });
    expect(out).toMatch(/warm_up/);
    expect(out).toMatch(/primera persona/i);
  });
});
