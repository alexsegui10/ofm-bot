import { describe, it, expect, vi } from 'vitest';
import {
  parseAdminCommand,
  dispatchAdminCommand,
  adminCommandHandlers,
} from './telegramAdminCommands.js';

const ADMIN_ID = '5516282183';
const NON_ADMIN_ID = '9999999999';

function makeServicesMock(overrides = {}) {
  return {
    pauseChatBot: vi.fn().mockResolvedValue({ id: 1, status: 'paused_manual', paused_at: '2026-04-21T12:00:00Z' }),
    resumeChatBot: vi.fn().mockResolvedValue({ id: 1, paused_at: '2026-04-21T12:00:00Z', resumed_at: '2026-04-21T12:05:00Z' }),
    getPausedChats: vi.fn().mockResolvedValue([]),
    getChatStatus: vi.fn().mockResolvedValue('active'),
    resolveClientIdentifier: vi.fn().mockResolvedValue(42),
    ...overrides,
  };
}

// ─── parseAdminCommand ───────────────────────────────────────────────────────

describe('parseAdminCommand', () => {
  it('parses "/pausar 42"', () => {
    expect(parseAdminCommand('/pausar 42')).toEqual({ command: 'pausar', args: ['42'] });
  });

  it('parses "/pausar 42 motivo libre aquí"', () => {
    expect(parseAdminCommand('/pausar 42 motivo libre aquí')).toEqual({
      command: 'pausar',
      args: ['42', 'motivo', 'libre', 'aquí'],
    });
  });

  it('parses "/pausados" without args', () => {
    expect(parseAdminCommand('/pausados')).toEqual({ command: 'pausados', args: [] });
  });

  it('strips @botname suffix from command', () => {
    expect(parseAdminCommand('/pausar@alba_bot 42')).toEqual({ command: 'pausar', args: ['42'] });
  });

  it('lowercases command name', () => {
    expect(parseAdminCommand('/PauSar 42')).toEqual({ command: 'pausar', args: ['42'] });
  });

  it('returns null for non-command text', () => {
    expect(parseAdminCommand('hola')).toBeNull();
    expect(parseAdminCommand('pausar 42')).toBeNull(); // falta "/"
  });

  it('returns null for empty/null/undefined', () => {
    expect(parseAdminCommand('')).toBeNull();
    expect(parseAdminCommand(null)).toBeNull();
    expect(parseAdminCommand(undefined)).toBeNull();
  });

  it('ignores leading/trailing whitespace', () => {
    expect(parseAdminCommand('   /estado 42  ')).toEqual({ command: 'estado', args: ['42'] });
  });
});

// ─── /whoami (no auth) ───────────────────────────────────────────────────────

describe('dispatchAdminCommand — /whoami', () => {
  it('responds with caller user.id regardless of auth', async () => {
    const services = makeServicesMock();
    const reply = await dispatchAdminCommand({
      text: '/whoami',
      fromId: NON_ADMIN_ID,
      adminId: ADMIN_ID,
      services,
    });
    expect(reply).toContain(NON_ADMIN_ID);
  });

  it('responds for admin too', async () => {
    const reply = await dispatchAdminCommand({
      text: '/whoami',
      fromId: ADMIN_ID,
      adminId: ADMIN_ID,
      services: makeServicesMock(),
    });
    expect(reply).toContain(ADMIN_ID);
  });
});

// ─── auth guard ──────────────────────────────────────────────────────────────

describe('dispatchAdminCommand — auth guard', () => {
  it('ignores /pausar from non-admin (returns null, no service call)', async () => {
    const services = makeServicesMock();
    const reply = await dispatchAdminCommand({
      text: '/pausar 42',
      fromId: NON_ADMIN_ID,
      adminId: ADMIN_ID,
      services,
    });
    expect(reply).toBeNull();
    expect(services.pauseChatBot).not.toHaveBeenCalled();
  });

  it('ignores /reactivar from non-admin', async () => {
    const services = makeServicesMock();
    const reply = await dispatchAdminCommand({
      text: '/reactivar 42',
      fromId: NON_ADMIN_ID,
      adminId: ADMIN_ID,
      services,
    });
    expect(reply).toBeNull();
    expect(services.resumeChatBot).not.toHaveBeenCalled();
  });

  it('ignores /estado from non-admin', async () => {
    const services = makeServicesMock();
    const reply = await dispatchAdminCommand({
      text: '/estado 42',
      fromId: NON_ADMIN_ID,
      adminId: ADMIN_ID,
      services,
    });
    expect(reply).toBeNull();
    expect(services.getChatStatus).not.toHaveBeenCalled();
  });

  it('ignores /pausados from non-admin', async () => {
    const services = makeServicesMock();
    const reply = await dispatchAdminCommand({
      text: '/pausados',
      fromId: NON_ADMIN_ID,
      adminId: ADMIN_ID,
      services,
    });
    expect(reply).toBeNull();
    expect(services.getPausedChats).not.toHaveBeenCalled();
  });

  it('treats fromId and adminId as strings (int vs string should match)', async () => {
    const services = makeServicesMock();
    const reply = await dispatchAdminCommand({
      text: '/estado 42',
      fromId: Number(ADMIN_ID),
      adminId: ADMIN_ID,
      services,
    });
    expect(reply).not.toBeNull();
  });
});

// ─── /pausar ──────────────────────────────────────────────────────────────────

describe('dispatchAdminCommand — /pausar', () => {
  it('calls pauseChatBot with resolved id and default motivo', async () => {
    const services = makeServicesMock();
    const reply = await dispatchAdminCommand({
      text: '/pausar 42',
      fromId: ADMIN_ID,
      adminId: ADMIN_ID,
      services,
    });
    expect(services.resolveClientIdentifier).toHaveBeenCalledWith('42');
    expect(services.pauseChatBot).toHaveBeenCalledWith(42, 'admin_manual');
    expect(reply).toContain('pausado');
    expect(reply).toContain('client_id=42');
  });

  it('forwards multi-word motivo joined by space', async () => {
    const services = makeServicesMock();
    await dispatchAdminCommand({
      text: '/pausar 42 videollamada programada mañana',
      fromId: ADMIN_ID,
      adminId: ADMIN_ID,
      services,
    });
    expect(services.pauseChatBot).toHaveBeenCalledWith(42, 'videollamada programada mañana');
  });

  it('returns usage hint when no id given', async () => {
    const services = makeServicesMock();
    const reply = await dispatchAdminCommand({
      text: '/pausar',
      fromId: ADMIN_ID,
      adminId: ADMIN_ID,
      services,
    });
    expect(reply).toMatch(/uso/i);
    expect(services.pauseChatBot).not.toHaveBeenCalled();
  });

  it('responds with "no encuentro cliente" when resolver returns null', async () => {
    const services = makeServicesMock({ resolveClientIdentifier: vi.fn().mockResolvedValue(null) });
    const reply = await dispatchAdminCommand({
      text: '/pausar 9999',
      fromId: ADMIN_ID,
      adminId: ADMIN_ID,
      services,
    });
    expect(reply).toContain('no encuentro');
    expect(services.pauseChatBot).not.toHaveBeenCalled();
  });

  it('catches service errors and returns error message', async () => {
    const services = makeServicesMock({ pauseChatBot: vi.fn().mockRejectedValue(new Error('db down')) });
    const reply = await dispatchAdminCommand({
      text: '/pausar 42',
      fromId: ADMIN_ID,
      adminId: ADMIN_ID,
      services,
    });
    expect(reply).toContain('❌');
    expect(reply).toContain('db down');
  });
});

// ─── /reactivar ───────────────────────────────────────────────────────────────

describe('dispatchAdminCommand — /reactivar', () => {
  it('calls resumeChatBot with resolved id', async () => {
    const services = makeServicesMock();
    const reply = await dispatchAdminCommand({
      text: '/reactivar 42',
      fromId: ADMIN_ID,
      adminId: ADMIN_ID,
      services,
    });
    expect(services.resumeChatBot).toHaveBeenCalledWith(42, 'admin_manual');
    expect(reply).toContain('reactivado');
  });

  it('returns informational message when no active pause', async () => {
    const services = makeServicesMock({ resumeChatBot: vi.fn().mockResolvedValue(null) });
    const reply = await dispatchAdminCommand({
      text: '/reactivar 42',
      fromId: ADMIN_ID,
      adminId: ADMIN_ID,
      services,
    });
    expect(reply).toContain('ℹ️');
    expect(reply).toContain('no tenía pausa');
  });

  it('returns usage when no id', async () => {
    const reply = await dispatchAdminCommand({
      text: '/reactivar',
      fromId: ADMIN_ID,
      adminId: ADMIN_ID,
      services: makeServicesMock(),
    });
    expect(reply).toMatch(/uso/i);
  });
});

// ─── /estado ──────────────────────────────────────────────────────────────────

describe('dispatchAdminCommand — /estado', () => {
  it('returns current status', async () => {
    const services = makeServicesMock({ getChatStatus: vi.fn().mockResolvedValue('paused_awaiting_videocall') });
    const reply = await dispatchAdminCommand({
      text: '/estado 42',
      fromId: ADMIN_ID,
      adminId: ADMIN_ID,
      services,
    });
    expect(reply).toContain('paused_awaiting_videocall');
  });
});

// ─── /pausados ────────────────────────────────────────────────────────────────

describe('dispatchAdminCommand — /pausados', () => {
  it('returns "no hay chats pausados" when empty', async () => {
    const reply = await dispatchAdminCommand({
      text: '/pausados',
      fromId: ADMIN_ID,
      adminId: ADMIN_ID,
      services: makeServicesMock(),
    });
    expect(reply).toMatch(/no hay chats pausados/i);
  });

  it('lists paused chats with client_id, telegram_user_id, status, motivo', async () => {
    const services = makeServicesMock({
      getPausedChats: vi.fn().mockResolvedValue([
        {
          client_id: 42,
          telegram_user_id: '123456',
          status: 'paused_manual',
          paused_at: '2026-04-21T12:00:00Z',
          reason: 'admin test',
        },
        {
          client_id: 99,
          telegram_user_id: '789',
          status: 'paused_awaiting_videocall',
          paused_at: '2026-04-21T13:00:00Z',
          reason: null,
        },
      ]),
    });
    const reply = await dispatchAdminCommand({
      text: '/pausados',
      fromId: ADMIN_ID,
      adminId: ADMIN_ID,
      services,
    });
    expect(reply).toContain('2 pausado');
    expect(reply).toContain('client_id=42');
    expect(reply).toContain('client_id=99');
    expect(reply).toContain('admin test');
    expect(reply).toContain('paused_awaiting_videocall');
  });
});

// ─── unknown commands ─────────────────────────────────────────────────────────

describe('dispatchAdminCommand — unknown commands', () => {
  it('returns null for unknown admin command', async () => {
    const reply = await dispatchAdminCommand({
      text: '/foobar 42',
      fromId: ADMIN_ID,
      adminId: ADMIN_ID,
      services: makeServicesMock(),
    });
    expect(reply).toBeNull();
  });

  it('returns null for non-command text', async () => {
    const reply = await dispatchAdminCommand({
      text: 'hola',
      fromId: ADMIN_ID,
      adminId: ADMIN_ID,
      services: makeServicesMock(),
    });
    expect(reply).toBeNull();
  });
});

// ─── handler map export ──────────────────────────────────────────────────────

describe('adminCommandHandlers export', () => {
  it('exposes all expected commands', () => {
    expect(Object.keys(adminCommandHandlers).sort()).toEqual([
      'estado', 'pausados', 'pausar', 'reactivar', 'whoami',
    ].sort());
  });
});
