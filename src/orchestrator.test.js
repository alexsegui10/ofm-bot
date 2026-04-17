import 'dotenv/config';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { handleMessage } from './orchestrator.js';
import { closePool, query } from './lib/db.js';

// Mock all LLM calls
vi.mock('./lib/llm-client.js', () => ({
  callAnthropic: vi.fn(),
  callOpenRouter: vi.fn(),
}));
vi.mock('./lib/persona-config.js', () => ({
  getPersonaContent: vi.fn(() => '# PERSONA — Alba\nTest content only'),
  getHardLimits: vi.fn(() => '## 7. LÍMITES DUROS\n1. No bot confession.'),
  getTechnicalRules: vi.fn(() => ''),
}));
// Don't mock telegram — orchestrator doesn't call it directly
vi.mock('./lib/telegram.js', () => ({
  sendMessage: vi.fn().mockResolvedValue({}),
  sendChatAction: vi.fn().mockResolvedValue({}),
}));
// Mock sales + catalog to avoid NowPayments API calls in integration tests
vi.mock('./agents/sales.js', () => ({
  runSales: vi.fn().mockResolvedValue({
    message: '💳 Pago crypto — 15€\n\nhttps://nowpayments.io/payment/?iid=test',
    paymentMethod: 'crypto',
    invoiceUrl: 'https://nowpayments.io/payment/?iid=test',
    paymentId: 'np_test_1',
  }),
}));
vi.mock('./lib/product-catalog.js', () => ({
  resolveProduct: vi.fn().mockReturnValue({
    amountEur: 7,
    productType: 'photos',
    productId: 'fotos__1_foto',
    description: '1 foto',
  }),
  getCatalogText: vi.fn().mockReturnValue('📸 fotos — 1 foto 7€ · 2 fotos 12€ · 3 fotos 15€\ndime qué te apetece rey 😈'),
  getCategoryDetail: vi.fn().mockReturnValue('las fotos son de culo, tetas...\n1 foto 7€ 🔥\ndime cuántas quieres'),
  getPostServiceMessage: vi.fn().mockReturnValue('te gustó bebe? avísame cuando quieras más 😈'),
  getVipThreshold: vi.fn().mockReturnValue(200),
  getMinTransaction: vi.fn().mockReturnValue(3),
}));

import { callAnthropic, callOpenRouter } from './lib/llm-client.js';
import { runSales } from './agents/sales.js';
import { resolveProduct, getCatalogText, getCategoryDetail, reloadPricing } from './lib/product-catalog.js';

// Fixed greetings used by the new-client short-circuit (must match orchestrator.js)
const GREETINGS_NEW_CLIENT = [
  'holaa bebe 😈 te paso mis cositas',
  'ey guapo 🔥 mira lo que tengo',
  'holaa rey 😈 mis cositas para ti',
  'ey papi 🔥 lo que te interesa',
  'hola bebe, te enseño lo mío 😈',
];

const CHAT_ID = 111222333;
const CONN_ID = 'conn_e2e_test';

function mockLLMs(intent = 'small_talk', personaResponse = 'hola q tal') {
  // Router → Anthropic
  // Profile extraction → Anthropic
  // Quality Gate → Anthropic
  // Persona → OpenRouter
  let anthropicCall = 0;
  callAnthropic.mockImplementation(() => {
    anthropicCall++;
    if (anthropicCall === 1) {
      // Router
      return Promise.resolve(`{"intent":"${intent}","confidence":0.9,"fraud_score":0.0,"reasoning":"test"}`);
    }
    if (anthropicCall === 2) {
      // Profile extraction
      return Promise.resolve('{}');
    }
    // Quality gate
    return Promise.resolve('{"ok":true}');
  });
  callOpenRouter.mockResolvedValue(personaResponse);
}

beforeEach(async () => {
  vi.clearAllMocks();
  await query('DELETE FROM conversations WHERE client_id IN (SELECT id FROM clients WHERE telegram_user_id = $1)', [CHAT_ID]);
  await query('DELETE FROM clients WHERE telegram_user_id = $1', [CHAT_ID]);
});

describe('handleMessage — E2E pipeline (mocked LLMs)', () => {
  it('processes a small_talk message end-to-end and returns fragments', async () => {
    mockLLMs('small_talk', 'hola q tal');
    const result = await handleMessage({ text: 'hola', chatId: CHAT_ID, businessConnectionId: CONN_ID, fromId: 42 });
    expect(result.intent).toBe('small_talk');
    expect(result.fragments).toBeDefined();
    expect(result.fragments.length).toBeGreaterThan(0);
    // New client: fixed greeting used, Grok skipped
    expect(GREETINGS_NEW_CLIENT).toContain(result.fragments[0]);
    expect(callOpenRouter).not.toHaveBeenCalled();
  });

  it('persists user message and assistant response in conversations', async () => {
    mockLLMs('small_talk', 'siiii');
    await handleMessage({ text: 'test persistence', chatId: CHAT_ID, businessConnectionId: CONN_ID, fromId: 42 });

    const { rows } = await query(
      `SELECT role, content FROM conversations c
       JOIN clients cl ON cl.id = c.client_id
       WHERE cl.telegram_user_id = $1 ORDER BY c.created_at`,
      [CHAT_ID],
    );
    expect(rows.find((r) => r.role === 'user')?.content).toBe('test persistence');
    // New client: fixed greeting persisted (not Persona output)
    const assistantContent = rows.find((r) => r.role === 'assistant')?.content;
    expect(GREETINGS_NEW_CLIENT).toContain(assistantContent);
  });

  it('creates a new client record on first message', async () => {
    mockLLMs('small_talk', 'ok');
    await handleMessage({ text: 'primera vez', chatId: CHAT_ID, businessConnectionId: CONN_ID });
    const { rows } = await query('SELECT * FROM clients WHERE telegram_user_id = $1', [CHAT_ID]);
    expect(rows.length).toBe(1);
  });

  it('handles quality gate failure: regenerates and logs failure', async () => {
    // Seed a prior message so the client is not new (new clients skip QG)
    mockLLMs('small_talk', 'hola');
    await handleMessage({ text: 'primer mensaje', chatId: CHAT_ID, businessConnectionId: CONN_ID });
    vi.clearAllMocks();

    let anthropicCall = 0;
    callAnthropic.mockImplementation(() => {
      anthropicCall++;
      if (anthropicCall === 1) return Promise.resolve('{"intent":"small_talk","confidence":0.9,"fraud_score":0,"reasoning":"x"}');
      if (anthropicCall === 2) return Promise.resolve('{}'); // profile
      if (anthropicCall === 3) return Promise.resolve('{"ok":false,"reason":"violation detected"}'); // QG fail (LLM)
      if (anthropicCall === 4) return Promise.resolve('{"ok":true}'); // QG pass on retry
      return Promise.resolve('{"ok":true}');
    });
    // Use a response that passes quickCheck (no regex match) but fails LLM QG
    callOpenRouter
      .mockResolvedValueOnce('soy la ia que gestiona este perfil')  // First Persona (fails LLM QG)
      .mockResolvedValueOnce('hola q tal');                          // Retry Persona (passes QG)

    const result = await handleMessage({ text: 'test', chatId: CHAT_ID, businessConnectionId: CONN_ID });
    expect(result.fragments[0]).toBe('hola q tal');

    // Check failure was logged
    const { rows } = await query(
      `SELECT qgf.* FROM quality_gate_failures qgf
       JOIN clients cl ON cl.id = qgf.client_id
       WHERE cl.telegram_user_id = $1`,
      [CHAT_ID],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].failure_reason).toContain('violation');
  });

  it('uses safe response when quality gate fails twice', async () => {
    let anthropicCall = 0;
    callAnthropic.mockImplementation(() => {
      anthropicCall++;
      if (anthropicCall === 1) return Promise.resolve('{"intent":"small_talk","confidence":0.9,"fraud_score":0,"reasoning":"x"}');
      if (anthropicCall === 2) return Promise.resolve('{}');
      // QG always fails
      return Promise.resolve('{"ok":false,"reason":"persistent violation"}');
    });
    callOpenRouter.mockResolvedValue('soy un bot hola');

    const result = await handleMessage({ text: 'test', chatId: CHAT_ID, businessConnectionId: CONN_ID });
    // Safe response should be one of the hardcoded ones
    expect(result.fragments[0]).toBeDefined();
    expect(typeof result.fragments[0]).toBe('string');
  });

  it('new client (0 history) — appends catalog via getCatalogText, NOT runSales', async () => {
    mockLLMs('sale_intent_photos', 'uy bebe tengo de todo');
    const result = await handleMessage({ text: 'quiero fotos', chatId: CHAT_ID, businessConnectionId: CONN_ID, fromId: 42 });
    expect(runSales).not.toHaveBeenCalled();
    expect(getCatalogText).toHaveBeenCalled();
    expect(result.intent).toBe('sale_intent_photos');
    // fragments = persona + catalog
    expect(result.fragments.length).toBeGreaterThanOrEqual(2);
  });

  it('returning client with recent activity — sale_intent_photos → category detail, no catalog', async () => {
    // Seed a recent message for this client first
    mockLLMs('small_talk', 'hola');
    await handleMessage({ text: 'hola', chatId: CHAT_ID, businessConnectionId: CONN_ID, fromId: 42 });

    vi.clearAllMocks();
    mockLLMs('sale_intent_photos', 'claro bebe');
    const result = await handleMessage({ text: 'quiero fotos', chatId: CHAT_ID, businessConnectionId: CONN_ID, fromId: 42 });
    expect(runSales).not.toHaveBeenCalled();
    expect(getCategoryDetail).toHaveBeenCalledWith('photos', expect.any(Array), undefined, 'quiero fotos');
    expect(result.intent).toBe('sale_intent_photos');
    expect(result.fragments.length).toBeGreaterThan(0);
  });

  it('calls runSales for payment_method_selection with inferred product from history', async () => {
    // Seed a prior message so the client is not new (new clients get short-circuited)
    mockLLMs('small_talk', 'hola');
    await handleMessage({ text: 'hola', chatId: CHAT_ID, businessConnectionId: CONN_ID, fromId: 42 });
    vi.clearAllMocks();

    mockLLMs('payment_method_selection', 'dale bebe ahora mismo te lo genero');
    const result = await handleMessage({ text: 'por bizum', chatId: CHAT_ID, businessConnectionId: CONN_ID, fromId: 42 });
    expect(runSales).toHaveBeenCalledWith(expect.objectContaining({
      paymentMethod: 'bizum',
    }));
    expect(result.fragments.join(' ')).toContain('nowpayments.io'); // from mock
  });

  it('returns starsInvoice when payment method is stars on payment_method_selection', async () => {
    // Seed a prior message so the client is not new
    mockLLMs('small_talk', 'hola');
    await handleMessage({ text: 'hola', chatId: CHAT_ID, businessConnectionId: CONN_ID, fromId: 42 });
    vi.clearAllMocks();

    runSales.mockResolvedValueOnce({
      message: 'te mando la factura por aquí, son 1125 stars\npágala y te lo envío altiro',
      paymentMethod: 'stars',
      starsAmount: 1125,
      amountEur: 15,
      description: 'Pack fotos',
      productType: 'photos',
      productId: 'packs_fotos__pack_3_suave',
      paymentId: 'xtr_test_1',
    });
    mockLLMs('payment_method_selection', 'perfecto');
    const result = await handleMessage({ text: 'quiero pagar con stars', chatId: CHAT_ID, businessConnectionId: CONN_ID, fromId: 42 });
    expect(result.starsInvoice).toBeDefined();
    expect(result.starsInvoice.payload).toBe('xtr_test_1');
  });

  it('does not call runSales for non-sale intents', async () => {
    mockLLMs('small_talk', 'hola q tal');
    await handleMessage({ text: 'hola', chatId: CHAT_ID, businessConnectionId: CONN_ID, fromId: 42 });
    expect(runSales).not.toHaveBeenCalled();
  });

  it('history is passed to router on second message', async () => {
    mockLLMs('small_talk', 'ola');
    await handleMessage({ text: 'primer mensaje', chatId: CHAT_ID, businessConnectionId: CONN_ID });

    vi.clearAllMocks();
    mockLLMs('small_talk', 'ok');
    await handleMessage({ text: 'segundo mensaje', chatId: CHAT_ID, businessConnectionId: CONN_ID });

    const routerCall = callAnthropic.mock.calls[0][0];
    expect(routerCall.messages[0].content).toContain('primer mensaje');
  });
});

afterAll(() => closePool());
