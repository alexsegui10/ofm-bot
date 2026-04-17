import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseBusinessMessage,
  echoMessage,
  registerBusinessHandlers,
  scheduleReadReceipt,
  clearReadQueues,
} from './business.js';

vi.mock('../agents/message-pacer.js', () => ({
  queueMessage: vi.fn(),
  sendFragments: vi.fn(),
  getPacerConfig: vi.fn(() => ({})),
}));
vi.mock('../orchestrator.js', () => ({
  handleMessage: vi.fn().mockResolvedValue({ fragments: ['ok'], intent: 'small_talk' }),
}));
vi.mock('../agents/sexting-conductor.js', () => ({
  getActiveSession: vi.fn().mockResolvedValue(null),
}));
vi.mock('../lib/telegram.js', () => ({
  readBusinessMessage: vi.fn().mockResolvedValue(undefined),
}));

import { queueMessage } from '../agents/message-pacer.js';
import { handleMessage } from '../orchestrator.js';
import { getActiveSession } from '../agents/sexting-conductor.js';
import { readBusinessMessage } from '../lib/telegram.js';

afterEach(() => {
  clearReadQueues();
  vi.clearAllMocks();
});

// ─── parseBusinessMessage ────────────────────────────────────────────────────

describe('parseBusinessMessage', () => {
  it('extracts all fields from a text message', () => {
    const update = {
      business_message: {
        message_id: 101,
        business_connection_id: 'conn_abc123',
        chat: { id: 111222 },
        from: { id: 999, username: 'testfan' },
        text: 'hola guapa',
      },
    };
    const p = parseBusinessMessage(update);
    expect(p.businessConnectionId).toBe('conn_abc123');
    expect(p.chatId).toBe(111222);
    expect(p.messageId).toBe(101);
    expect(p.fromId).toBe(999);
    expect(p.fromUsername).toBe('testfan');
    expect(p.text).toBe('hola guapa');
    expect(p.hasMedia).toBe(false);
  });

  it('extracts messageId from message_id field', () => {
    const update = {
      business_message: {
        message_id: 42,
        business_connection_id: 'conn_abc',
        chat: { id: 1 },
        from: { id: 2 },
        text: 'test',
      },
    };
    expect(parseBusinessMessage(update).messageId).toBe(42);
  });

  it('returns null messageId when message_id is missing', () => {
    const update = {
      business_message: {
        business_connection_id: 'conn_abc',
        chat: { id: 1 },
        from: { id: 2 },
        text: 'test',
      },
    };
    expect(parseBusinessMessage(update).messageId).toBeNull();
  });

  it('detects photo messages', () => {
    const update = {
      business_message: {
        business_connection_id: 'conn_abc',
        chat: { id: 1 },
        from: { id: 2 },
        photo: [{ file_id: 'xyz', width: 100, height: 100, file_size: 1024 }],
      },
    };
    const p = parseBusinessMessage(update);
    expect(p.text).toBeNull();
    expect(p.hasMedia).toBe(true);
  });

  it('detects video messages', () => {
    const update = {
      business_message: {
        business_connection_id: 'conn_abc',
        chat: { id: 1 },
        from: { id: 2 },
        video: { file_id: 'vid_xyz', duration: 10 },
      },
    };
    expect(parseBusinessMessage(update).hasMedia).toBe(true);
  });

  it('handles missing from field (channel messages)', () => {
    const update = {
      business_message: {
        business_connection_id: 'conn_abc',
        chat: { id: 1 },
        text: 'test',
      },
    };
    const p = parseBusinessMessage(update);
    expect(p.fromId).toBeNull();
    expect(p.fromUsername).toBeNull();
    expect(p.text).toBe('test');
  });

  it('returns null text when message has no text field', () => {
    const update = {
      business_message: {
        business_connection_id: 'conn_abc',
        chat: { id: 1 },
        from: { id: 2 },
        sticker: { file_id: 'stk_xyz', emoji: '😀' },
      },
    };
    expect(parseBusinessMessage(update).text).toBeNull();
  });
});

// ─── echoMessage ────────────────────────────────────────────────────────────

describe('echoMessage', () => {
  it('calls api.sendMessage with correct params', async () => {
    const mockApi = {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 42 }),
    };
    const result = await echoMessage(
      { businessConnectionId: 'conn_abc', chatId: 123, text: 'hola' },
      mockApi,
    );
    expect(mockApi.sendMessage).toHaveBeenCalledWith(
      123,
      'hola',
      { business_connection_id: 'conn_abc' },
    );
    expect(result.message_id).toBe(42);
  });

  it('returns null and skips API call when text is null', async () => {
    const mockApi = { sendMessage: vi.fn() };
    const result = await echoMessage(
      { businessConnectionId: 'conn_abc', chatId: 123, text: null },
      mockApi,
    );
    expect(result).toBeNull();
    expect(mockApi.sendMessage).not.toHaveBeenCalled();
  });

  it('returns null and skips API call when text is empty string', async () => {
    const mockApi = { sendMessage: vi.fn() };
    const result = await echoMessage(
      { businessConnectionId: 'conn_abc', chatId: 123, text: '' },
      mockApi,
    );
    expect(result).toBeNull();
    expect(mockApi.sendMessage).not.toHaveBeenCalled();
  });
});

// ─── scheduleReadReceipt / clearReadQueues ────────────────────────────────────

describe('scheduleReadReceipt', () => {
  it('calls readBusinessMessage after the timer fires', async () => {
    vi.useFakeTimers();
    scheduleReadReceipt(111, 'conn_test', 55);
    expect(readBusinessMessage).not.toHaveBeenCalled();
    // Advance past max delay (5s)
    await vi.advanceTimersByTimeAsync(6000);
    expect(readBusinessMessage).toHaveBeenCalledWith('conn_test', 111, 55);
    vi.useRealTimers();
  });

  it('replaces pending timer for same chat (burst messages — only last read receipt fires)', () => {
    vi.useFakeTimers();
    scheduleReadReceipt(222, 'conn_test', 10);
    scheduleReadReceipt(222, 'conn_test', 11); // overwrites
    vi.advanceTimersByTime(6000);
    // readBusinessMessage called once, with the latest messageId
    expect(readBusinessMessage).toHaveBeenCalledTimes(1);
    expect(readBusinessMessage).toHaveBeenCalledWith('conn_test', 222, 11);
    vi.useRealTimers();
  });

  it('clearReadQueues cancels all pending timers', () => {
    vi.useFakeTimers();
    scheduleReadReceipt(333, 'conn_test', 20);
    scheduleReadReceipt(444, 'conn_test', 21);
    clearReadQueues();
    vi.advanceTimersByTime(10000);
    expect(readBusinessMessage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// ─── registerBusinessHandlers ─────────────────────────────────────────────

describe('registerBusinessHandlers', () => {
  it('registers handlers for business_connection, business_message, deleted_business_messages', () => {
    const registeredEvents = [];
    const mockBot = {
      on: (event, _handler) => registeredEvents.push(event),
    };
    registerBusinessHandlers(mockBot);
    expect(registeredEvents).toContain('business_connection');
    expect(registeredEvents).toContain('business_message');
    expect(registeredEvents).toContain('deleted_business_messages');
  });

  it('business_message handler queues text via queueMessage with config and phase', async () => {
    const handlers = {};
    const mockBot = {
      on: (event, handler) => { handlers[event] = handler; },
    };
    registerBusinessHandlers(mockBot);

    const ctx = {
      update: {
        business_message: {
          message_id: 99,
          business_connection_id: 'conn_test',
          chat: { id: 555 },
          from: { id: 888, username: 'fan' },
          text: 'test echo',
        },
      },
      api: { sendMessage: vi.fn() },
    };

    await handlers['business_message'](ctx);

    expect(queueMessage).toHaveBeenCalledWith(
      555,
      'conn_test',
      'test echo',
      expect.any(Function),
      {},       // getPacerConfig() mock returns {}
      null,     // getActiveSession returns null → no phase
    );
  });

  it('business_message handler uses sexting phase when session is active', async () => {
    getActiveSession.mockResolvedValueOnce({ current_phase: 3, status: 'active' });

    const handlers = {};
    const mockBot = {
      on: (event, handler) => { handlers[event] = handler; },
    };
    registerBusinessHandlers(mockBot);

    const ctx = {
      update: {
        business_message: {
          message_id: 100,
          business_connection_id: 'conn_test',
          chat: { id: 666 },
          from: { id: 777 },
          text: 'hola',
        },
      },
    };

    await handlers['business_message'](ctx);

    expect(queueMessage).toHaveBeenCalledWith(
      666, 'conn_test', 'hola', expect.any(Function), {}, 3,
    );
  });

  it('business_message handler still queues media-only messages (text=null)', async () => {
    const handlers = {};
    const mockBot = {
      on: (event, handler) => { handlers[event] = handler; },
    };
    registerBusinessHandlers(mockBot);

    const ctx = {
      update: {
        business_message: {
          business_connection_id: 'conn_test',
          chat: { id: 555 },
          from: { id: 888 },
          photo: [{ file_id: 'photo_xyz' }],
        },
      },
    };

    await handlers['business_message'](ctx);
    expect(queueMessage).toHaveBeenCalledWith(
      555,
      'conn_test',
      null,
      expect.any(Function),
      {},
      null,
    );
  });

  it('passes hasMedia=true and activeSexting=false when photo message and no active session', async () => {
    const handlers = {};
    const mockBot = { on: (event, handler) => { handlers[event] = handler; } };
    registerBusinessHandlers(mockBot);

    const ctx = {
      update: {
        business_message: {
          business_connection_id: 'conn_test',
          chat: { id: 777 },
          from: { id: 888 },
          photo: [{ file_id: 'photo_xyz' }],
        },
      },
      api: { sendMessage: vi.fn() },
    };

    await handlers['business_message'](ctx);

    // Grab the queued processFn and call it directly
    const processFn = queueMessage.mock.calls[0][3];
    await processFn('hola');

    expect(handleMessage).toHaveBeenCalledWith(expect.objectContaining({
      hasMedia: true,
      activeSexting: false,
    }));
  });

  it('passes activeSexting=true when active session exists', async () => {
    getActiveSession.mockResolvedValueOnce({ current_phase: 2, status: 'active' });

    const handlers = {};
    const mockBot = { on: (event, handler) => { handlers[event] = handler; } };
    registerBusinessHandlers(mockBot);

    const ctx = {
      update: {
        business_message: {
          business_connection_id: 'conn_test',
          chat: { id: 888 },
          from: { id: 999 },
          text: 'mira esto',
        },
      },
      api: { sendMessage: vi.fn() },
    };

    await handlers['business_message'](ctx);

    const processFn = queueMessage.mock.calls[0][3];
    await processFn('mira esto');

    expect(handleMessage).toHaveBeenCalledWith(expect.objectContaining({
      hasMedia: false,
      activeSexting: true,
    }));
  });
});
