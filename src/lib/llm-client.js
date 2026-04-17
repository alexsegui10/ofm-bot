import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { agentLogger } from './logger.js';
import { estimateCost } from './pricing.js';

const log = agentLogger('llm-client');

let _anthropic;
let _openrouter;

function getAnthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

function getOpenRouter() {
  if (!_openrouter) {
    _openrouter = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: env.OPENROUTER_API_KEY,
    });
  }
  return _openrouter;
}

/**
 * Call Anthropic (Claude) and return the text content.
 *
 * @param {object} opts
 * @param {string} [opts.model]
 * @param {string} opts.system
 * @param {Array}  opts.messages  - [{role, content}]
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {string} [opts.agent]   - label for logs
 */
export async function callAnthropic({
  model = 'claude-sonnet-4-6',
  system,
  messages,
  temperature = 0,
  maxTokens = 1024,
  agent = 'unknown',
}) {
  const start = Date.now();
  const response = await getAnthropic().messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages,
  });
  const latency = Date.now() - start;
  const cost = estimateCost(model, response.usage.input_tokens, response.usage.output_tokens);
  log.info({
    agent,
    model,
    latency_ms: latency,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cost_usd: cost?.toFixed(6),
  }, 'anthropic call');

  return response.content[0].text;
}

/**
 * Call OpenRouter and return the text content.
 * Falls back to MODEL_PERSONA_FALLBACK if the primary model fails.
 *
 * @param {object} opts
 * @param {string} opts.model
 * @param {Array}  opts.messages
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {string[]} [opts.stop]
 * @param {string} [opts.agent]
 * @param {boolean} [opts._isFallback]  - internal flag, do not set
 */
export async function callOpenRouter({
  model,
  messages,
  temperature = 0.85,
  maxTokens = 200,
  stop,
  agent = 'unknown',
  _isFallback = false,
}) {
  const start = Date.now();
  try {
    const params = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      frequency_penalty: 0.4,
      presence_penalty: 0.3,
      top_p: 0.9,
    };
    if (stop?.length) params.stop = stop;

    const response = await getOpenRouter().chat.completions.create(params);
    const latency = Date.now() - start;
    log.info({
      agent,
      model,
      latency_ms: latency,
      usage: response.usage,
    }, 'openrouter call');

    return response.choices[0].message.content;
  } catch (err) {
    log.error({ agent, model, err }, 'openrouter call failed');
    if (!_isFallback) {
      const fallback = env.MODEL_PERSONA_FALLBACK;
      log.warn({ fallback }, 'retrying with fallback model');
      return callOpenRouter({ model: fallback, messages, temperature, maxTokens, stop, agent, _isFallback: true });
    }
    throw err;
  }
}
