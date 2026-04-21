import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock twilio wrapper — nunca hacemos llamadas reales en tests.
vi.mock('../lib/twilio.js', () => ({
  sendWhatsApp: vi.fn().mockResolvedValue({ sid: 'SMmocked', status: 'queued' }),
}));

import {
  notifyOwner,
  EVENT_TEMPLATES,
  TwilioWhatsAppAdapter,
  NoopAdapter,
  getDefaultAdapter,
  setDefaultAdapter,
} from './notify-owner.js';
import { sendWhatsApp as mockedSendWhatsApp } from '../lib/twilio.js';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset singleton entre tests (evitamos que un setDefaultAdapter quede fijado).
  setDefaultAdapter(new NoopAdapter());
});

// ─── EVENT_TEMPLATES ──────────────────────────────────────────────────────────

describe('EVENT_TEMPLATES', () => {
  it('exposes videocall_requested', () => {
    expect(typeof EVENT_TEMPLATES.videocall_requested).toBe('function');
  });

  it('exposes ia_verification_serious', () => {
    expect(typeof EVENT_TEMPLATES.ia_verification_serious).toBe('function');
  });

  it('videocall_requested includes clientId, clientName, confirmedTime', () => {
    const body = EVENT_TEMPLATES.videocall_requested({
      clientId: 42,
      clientName: 'Pepe',
      confirmedTime: 'mañana a las 21:00',
    });
    expect(body).toContain('42');
    expect(body).toContain('Pepe');
    expect(body).toContain('mañana a las 21:00');
    expect(body).toMatch(/videollamada/i);
  });

  it('videocall_requested includes last 3 recent messages only', () => {
    const body = EVENT_TEMPLATES.videocall_requested({
      clientId: 1,
      recentMessages: [
        { role: 'user', content: 'uno' },
        { role: 'assistant', content: 'dos' },
        { role: 'user', content: 'tres' },
        { role: 'assistant', content: 'cuatro' },
        { role: 'user', content: 'cinco' },
      ],
    });
    expect(body).toContain('tres');
    expect(body).toContain('cuatro');
    expect(body).toContain('cinco');
    expect(body).not.toContain('uno');
    expect(body).not.toContain('dos');
  });

  it('videocall_requested works with minimal payload', () => {
    const body = EVENT_TEMPLATES.videocall_requested({ clientId: 7 });
    expect(body).toContain('7');
    expect(body).toContain('(sin nombre)');
    expect(body).toContain('(no especificado)');
  });

  it('ia_verification_serious includes literalMessage', () => {
    const body = EVENT_TEMPLATES.ia_verification_serious({
      clientId: 99,
      clientName: 'Juan',
      literalMessage: 'en serio eres una IA o no?',
    });
    expect(body).toContain('99');
    expect(body).toContain('Juan');
    expect(body).toContain('en serio eres una IA');
    expect(body).toMatch(/pausado/i);
  });

  it('ia_verification_serious truncates long literal messages to 1000 chars', () => {
    const long = 'a'.repeat(5000);
    const body = EVENT_TEMPLATES.ia_verification_serious({ clientId: 1, literalMessage: long });
    // Buscamos la corrida más larga de 'a' — la de literalMessage truncada.
    const allRuns = body.match(/a+/g) || [];
    const longestRun = allRuns.sort((x, y) => y.length - x.length)[0];
    expect(longestRun.length).toBe(1000);
  });

  it('ia_verification_serious leaves short messages intact (no truncation)', () => {
    const body = EVENT_TEMPLATES.ia_verification_serious({
      clientId: 1,
      literalMessage: 'mensaje corto sin truncar',
    });
    expect(body).toContain('mensaje corto sin truncar');
  });
});

// ─── TwilioWhatsAppAdapter ────────────────────────────────────────────────────

describe('TwilioWhatsAppAdapter', () => {
  it('delivers body via injected sendFn', async () => {
    const sendFn = vi.fn().mockResolvedValue({ sid: 'X' });
    const adapter = new TwilioWhatsAppAdapter({ to: 'whatsapp:+346xx', sendFn });
    await adapter.deliver('hola alex');
    expect(sendFn).toHaveBeenCalledWith('whatsapp:+346xx', 'hola alex');
  });

  it('returns null and logs warning when "to" is falsy', async () => {
    const sendFn = vi.fn();
    const adapter = new TwilioWhatsAppAdapter({ to: '', sendFn });
    const r = await adapter.deliver('hola');
    expect(r).toBeNull();
    expect(sendFn).not.toHaveBeenCalled();
  });

  it('uses env default when no "to" provided', async () => {
    // env.OWNER_WHATSAPP_TO existe en el .env de este repo.
    const sendFn = vi.fn().mockResolvedValue(null);
    const adapter = new TwilioWhatsAppAdapter({ sendFn });
    await adapter.deliver('test');
    // La llamada ocurrió con algún "to" truthy o se saltó; validamos comportamiento
    // según estado del env sin acoplarnos a un valor concreto.
    if (adapter.to) {
      expect(sendFn).toHaveBeenCalledWith(adapter.to, 'test');
    } else {
      expect(sendFn).not.toHaveBeenCalled();
    }
  });
});

// ─── NoopAdapter ──────────────────────────────────────────────────────────────

describe('NoopAdapter', () => {
  it('records deliveries locally without calling anything', async () => {
    const adapter = new NoopAdapter();
    const r = await adapter.deliver('mensaje');
    expect(r).toEqual({ noop: true });
    expect(adapter.sent).toEqual(['mensaje']);
  });

  it('accumulates multiple deliveries', async () => {
    const adapter = new NoopAdapter();
    await adapter.deliver('uno');
    await adapter.deliver('dos');
    expect(adapter.sent).toEqual(['uno', 'dos']);
  });
});

// ─── notifyOwner ──────────────────────────────────────────────────────────────

describe('notifyOwner', () => {
  it('renders template and delivers via injected adapter', async () => {
    const deliver = vi.fn().mockResolvedValue({ sid: 'OK' });
    const adapter = { deliver };
    await notifyOwner('videocall_requested', { clientId: 42, clientName: 'Pepe' }, { adapter });
    expect(deliver).toHaveBeenCalledTimes(1);
    const body = deliver.mock.calls[0][0];
    expect(body).toContain('42');
    expect(body).toContain('Pepe');
  });

  it('throws on unknown event', async () => {
    const deliver = vi.fn();
    await expect(
      notifyOwner('event_inexistente', {}, { adapter: { deliver } }),
    ).rejects.toThrow(/unknown event/);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('uses default adapter when none provided', async () => {
    const capturing = new NoopAdapter();
    setDefaultAdapter(capturing);
    await notifyOwner('ia_verification_serious', { clientId: 1, literalMessage: 'test' });
    expect(capturing.sent).toHaveLength(1);
    expect(capturing.sent[0]).toContain('test');
  });

  it('propagates adapter errors', async () => {
    const deliver = vi.fn().mockRejectedValue(new Error('twilio down'));
    await expect(
      notifyOwner('videocall_requested', { clientId: 1 }, { adapter: { deliver } }),
    ).rejects.toThrow(/twilio down/);
  });

  it('never calls the real twilio SDK (verified via mock)', async () => {
    const capturing = new NoopAdapter();
    setDefaultAdapter(capturing);
    await notifyOwner('videocall_requested', { clientId: 1 });
    expect(mockedSendWhatsApp).not.toHaveBeenCalled();
  });
});

// ─── getDefaultAdapter ────────────────────────────────────────────────────────

describe('getDefaultAdapter', () => {
  it('returns an adapter with deliver()', () => {
    setDefaultAdapter(null); // force lazy init path
    const a = getDefaultAdapter();
    expect(typeof a.deliver).toBe('function');
  });

  it('returns same instance on repeated calls', () => {
    setDefaultAdapter(null);
    const a = getDefaultAdapter();
    const b = getDefaultAdapter();
    expect(a).toBe(b);
  });

  it('setDefaultAdapter overrides the singleton', () => {
    const custom = new NoopAdapter();
    setDefaultAdapter(custom);
    expect(getDefaultAdapter()).toBe(custom);
  });
});
