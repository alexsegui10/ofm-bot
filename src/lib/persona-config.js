import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PERSONA_PATH = join(__dirname, '../../config/persona.md');

let _content;

/** Returns the full persona.md content (cached after first read). */
export function getPersonaContent() {
  if (!_content) _content = readFileSync(PERSONA_PATH, 'utf-8');
  return _content;
}

/**
 * Returns only the "LÍMITES DUROS" section of persona.md.
 * Used by the Quality Gate as a focused constraint reference.
 */
export function getHardLimits() {
  const content = getPersonaContent();
  const match = content.match(/##\s*7\.\s*LÍMITES DUROS[\s\S]*?(?=\n##\s|\n---\s*$|$)/);
  return match ? match[0].trim() : '';
}

/**
 * Returns the "REGLAS TÉCNICAS" section.
 * Appended to the Persona system prompt.
 */
export function getTechnicalRules() {
  const content = getPersonaContent();
  const match = content.match(/##\s*8\.\s*REGLAS TÉCNICAS[\s\S]*?(?=\n##\s|\n---\s*$|$)/);
  return match ? match[0].trim() : '';
}
