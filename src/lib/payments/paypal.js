import { env } from '../../config/env.js';
import { agentLogger } from '../logger.js';

const log = agentLogger('paypal');

/**
 * PayPal integration is feature-flagged via PAYPAL_ENABLED=true.
 * Credentials will be added once account verification completes.
 */
export function isEnabled() {
  return env.PAYPAL_ENABLED === 'true';
}

/* eslint-disable no-unused-vars */

export async function createOrder(amountEur, description) {
  if (!isEnabled()) throw new Error('PayPal disabled — set PAYPAL_ENABLED=true to activate');
  // TODO: implement when PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are set
  throw new Error('PayPal not implemented yet');
}

export async function captureOrder(orderId) {
  if (!isEnabled()) throw new Error('PayPal disabled — set PAYPAL_ENABLED=true to activate');
  throw new Error('PayPal not implemented yet');
}

export async function verifyWebhookSignature(headers, body) {
  if (!isEnabled()) return false;
  throw new Error('PayPal not implemented yet');
}

/* eslint-enable no-unused-vars */

if (!isEnabled()) {
  log.info('PayPal integration is disabled (PAYPAL_ENABLED != true)');
}
