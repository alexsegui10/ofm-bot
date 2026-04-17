#!/usr/bin/env node
/**
 * scripts/generate-fake-clients.js
 *
 * Genera 50 perfiles de cliente ficticio vía Sonnet 4.6 para el fuzz-test.
 * Salida: `scripts/fake-clients.json` (array de { profile, opening_messages }).
 *
 * Reglas duras:
 *   - TODOS los perfiles son >= 18 años. NUNCA se simula un menor, ni siquiera
 *     por roleplay. Si el LLM devuelve algo que mencione <18, se descarta.
 *   - Variedad: nuevos vs clientes recurrentes, tímidos vs agresivos, con
 *     objetivo claro (fotos/videos/sexting/videollamada) vs exploratorios.
 *   - Idioma: español (es-ES) mayormente, algún es-LATAM.
 *
 * Uso:
 *   node scripts/generate-fake-clients.js            # genera 50 y escribe el JSON
 *   node scripts/generate-fake-clients.js --count=10 # cantidad custom
 */

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callAnthropic } from '../src/lib/llm-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_PATH = path.join(__dirname, 'fake-clients.json');

const BATCH_SIZE = 5;

const SYSTEM_PROMPT = `Eres un generador de perfiles de cliente ficticio para testing de un bot de Telegram que vende contenido adulto (videos, fotos, sexting) de una modelo de OnlyFans llamada Alba.

REGLAS DURAS (violarlas descalifica el perfil entero):
- TODOS los perfiles son mayores de edad (>= 18 años). Pon edad concreta entre 18 y 65.
- NUNCA generes un perfil que finja ser menor o que busque menores. Si un perfil incluye fantasía edad-juego, la edad simulada es "18+" explícita.
- NO perfiles de fuerzas del orden, periodistas o testers (nada de "police"/"journalist"/"qa").
- Tono realista: clientes de pago en internet. Pueden ser tímidos, agresivos, caballerosos, regateadores, cariñosos, fríos.

Devuelve SOLO JSON válido, sin texto alrededor, sin markdown, sin backticks.`;

const USER_PROMPT_TEMPLATE = (n) => `Genera ${n} perfiles ficticios, cada uno con:

{
  "id": "fc_<numero>",         // único, p.ej. "fc_001"
  "display_name": string,       // nombre falso p.ej. "Javier, 34, Barcelona"
  "age": number,                // 18..65
  "archetype": string,          // uno de: "tímido", "directo", "regateador", "cariñoso", "acosador leve", "exploratorio", "fan recurrente", "indeciso"
  "region": string,             // p.ej. "es-ES" o "es-MX"
  "target": string | null,      // intención: "fotos", "videos", "sexting", "videollamada", "personalizado", "charla", null
  "budget_eur": number,         // 5..100
  "personality_notes": string,  // 1-2 frases que expliquen cómo se comporta
  "opening_messages": string[]  // 3-6 mensajes en orden, como los escribiría el cliente en Telegram (en minúsculas, con errata ocasional, emojis ocasionales, lenguaje natural)
}

Variedad entre los ${n} perfiles:
- Mezcla archetypes.
- Algunos dicen qué quieren en el primer mensaje, otros sólo saludan y esperan.
- Algunos usan jerga sexual explícita, otros son más sutiles.
- Al menos 1 de cada ${n} es un cliente difícil (regateador, acosador leve, dudoso de pagar).

Devuelve un array JSON (no un objeto).`;

async function generateBatch(n) {
  const raw = await callAnthropic({
    model: 'claude-sonnet-4-6',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: USER_PROMPT_TEMPLATE(n) }],
    temperature: 1,
    maxTokens: 4096,
    agent: 'fake-client-gen',
  });
  // Strip any wrapping backticks just in case.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Invalid JSON from LLM: ${err.message}\n---\n${cleaned.slice(0, 500)}`);
  }
  if (!Array.isArray(parsed)) throw new Error('Expected array from LLM');
  return parsed;
}

function sanityCheck(profile) {
  const reasons = [];
  if (typeof profile.age !== 'number' || profile.age < 18 || profile.age > 99) reasons.push('age out of range');
  if (!Array.isArray(profile.opening_messages) || profile.opening_messages.length === 0) reasons.push('no opening_messages');
  const joined = JSON.stringify(profile).toLowerCase();
  if (/\b(menor|minor|adolescente|teen(?!s?\s*adulto))|\b1[0-7]\s*(años|anos|years)/.test(joined)) {
    reasons.push('suspected minor language');
  }
  return reasons;
}

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, ...rest] = a.replace(/^--/, '').split('=');
      return [k, rest.length ? rest.join('=') : true];
    }),
  );
  return {
    count: Number(args.count) || 50,
    out: args.out || OUT_PATH,
  };
}

async function main() {
  const { count, out } = parseArgs();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing in .env');
  console.log(`[fake-clients] generando ${count} perfiles en batches de ${BATCH_SIZE}…`);

  const profiles = [];
  const rejected = [];
  let idx = 1;

  while (profiles.length < count) {
    const remaining = count - profiles.length;
    const thisBatch = Math.min(BATCH_SIZE, remaining);
    console.log(`[fake-clients] batch de ${thisBatch} (${profiles.length}/${count} acumulados)…`);
    let batch;
    try {
      batch = await generateBatch(thisBatch);
    } catch (err) {
      console.error('[fake-clients] batch failed:', err.message);
      continue;
    }
    for (const p of batch) {
      const reasons = sanityCheck(p);
      if (reasons.length) {
        rejected.push({ profile: p, reasons });
        continue;
      }
      // Re-assign id so los rechazos no dejen huecos
      p.id = `fc_${String(idx).padStart(3, '0')}`;
      profiles.push(p);
      idx += 1;
      if (profiles.length >= count) break;
    }
  }

  const meta = {
    generated_at: new Date().toISOString(),
    count: profiles.length,
    rejected_count: rejected.length,
    model: 'claude-sonnet-4-6',
  };
  await fs.writeFile(out, JSON.stringify({ _meta: meta, profiles }, null, 2));
  console.log(`[fake-clients] ${profiles.length} perfiles escritos a ${out}`);
  if (rejected.length) console.log(`[fake-clients] ${rejected.length} rechazados (sanity check)`);
}

main().catch((err) => {
  console.error('[fake-clients] FATAL:', err.message);
  process.exitCode = 1;
});
