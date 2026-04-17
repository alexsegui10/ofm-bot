import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

const app = createApp();

describe('FASE 1 — HTTP endpoints', () => {
  it('GET /health returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  it('POST /webhook/telegram with empty body returns 200', async () => {
    const res = await request(app).post('/webhook/telegram').send({});
    expect(res.status).toBe(200);
  });

  it('POST /webhook/telegram with null body returns 200', async () => {
    const res = await request(app)
      .post('/webhook/telegram')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(200);
  });

  it('POST /webhook/nowpayments with invalid signature returns 401', async () => {
    const res = await request(app).post('/webhook/nowpayments').send({});
    expect(res.status).toBe(401);
  });

  it('POST /webhook/paypal returns 200', async () => {
    const res = await request(app).post('/webhook/paypal').send({});
    expect(res.status).toBe(200);
  });
});
