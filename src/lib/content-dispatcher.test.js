import { describe, it, expect, vi } from 'vitest';
import {
  parseSinglePhotoRequest,
  formatVideoListText,
  formatPackListText,
  formatSextingOptionsText,
  matchVideoFromText,
  matchPackFromText,
  matchSextingTemplateFromText,
} from './content-dispatcher.js';

// db.js no debe conectarse en tests unitarios — mockeamos para evitar pool.
vi.mock('./db.js', () => ({ query: vi.fn() }));

describe('parseSinglePhotoRequest', () => {
  it('extracts number and tag from canonical phrase', () => {
    expect(parseSinglePhotoRequest('quiero 2 fotos de culo')).toEqual({ count: 2, tag: 'culo' });
  });

  it('works with word-number "una"/"dos"/"tres"', () => {
    expect(parseSinglePhotoRequest('dame una de lencería')).toEqual({ count: 1, tag: 'lencería' });
    expect(parseSinglePhotoRequest('dos de tetas please')).toEqual({ count: 2, tag: 'tetas' });
    expect(parseSinglePhotoRequest('tres de coño')).toEqual({ count: 3, tag: 'coño' });
  });

  it('accepts "cono" sin tilde → coño', () => {
    expect(parseSinglePhotoRequest('2 fotos de cono')).toEqual({ count: 2, tag: 'coño' });
  });

  it('accepts "lenceria" sin tilde → lencería', () => {
    expect(parseSinglePhotoRequest('quiero una de lenceria')).toEqual({ count: 1, tag: 'lencería' });
  });

  it('returns null if number missing', () => {
    expect(parseSinglePhotoRequest('fotos de culo')).toBeNull();
  });

  it('returns null if tag missing or unknown', () => {
    expect(parseSinglePhotoRequest('quiero 2 fotos')).toBeNull();
    expect(parseSinglePhotoRequest('quiero 2 fotos de pies')).toBeNull();
  });

  it('returns null for empty/garbage', () => {
    expect(parseSinglePhotoRequest('')).toBeNull();
    expect(parseSinglePhotoRequest(null)).toBeNull();
  });

  it('clamps to 1..10 — 11 returns null', () => {
    // 11 no matchea el rango 1-10 del regex captura, así que count = null → return null
    expect(parseSinglePhotoRequest('quiero 15 fotos de culo')).toBeNull();
  });

  it('10 es válido', () => {
    expect(parseSinglePhotoRequest('quiero 10 fotos de tetas')).toEqual({ count: 10, tag: 'tetas' });
  });
});

describe('formatVideoListText', () => {
  it('lists videos with title/duration/price, truncated to 6', () => {
    const text = formatVideoListText();
    expect(text).toMatch(/^mis videos:/);
    expect(text).toMatch(/cuál te mola\?/);
    // products.json tiene 8 videos → aparece "tengo más"
    expect(text).toContain('tengo más si quieres');
  });

  it('respects max param', () => {
    const text = formatVideoListText(3);
    const itemLines = text.split('\n').filter((l) => l.startsWith('· '));
    expect(itemLines.length).toBe(3);
    expect(text).toContain('tengo más si quieres');
  });
});

describe('formatPackListText', () => {
  it('lists packs with num_fotos and price', () => {
    const text = formatPackListText();
    expect(text).toMatch(/^mis packs:/);
    expect(text).toMatch(/fotos/);
    expect(text).toMatch(/€/);
  });
});

describe('formatSextingOptionsText', () => {
  it('lists 3 options with min and price', () => {
    const text = formatSextingOptionsText();
    expect(text).toContain('5 min');
    expect(text).toContain('10 min');
    expect(text).toContain('15 min');
    expect(text).toMatch(/cuál te mola/);
  });
});

describe('matchVideoFromText', () => {
  it('matches squirt en la ducha', () => {
    const v = matchVideoFromText('quiero el del squirt');
    expect(v).toBeTruthy();
    expect(v.tags).toContain('squirt');
  });

  it('matches ducha rápida over squirt-ducha by score', () => {
    const v = matchVideoFromText('el de la ducha jabonándome');
    expect(v).toBeTruthy();
    // título exacto "ducha rápida jabonándome" gana por más palabras de título que matchean
    expect(v.id).toBe('v_007');
  });

  it('returns null when no match', () => {
    expect(matchVideoFromText('el del elefante rosa')).toBeNull();
  });
});

describe('matchPackFromText', () => {
  it('matches pack by keyword', () => {
    const p = matchPackFromText('el del culo por favor');
    expect(p).toBeTruthy();
    expect(p.id).toBe('pk_001');
  });
});

describe('matchSextingTemplateFromText', () => {
  it('matches 5/10/15 min', () => {
    expect(matchSextingTemplateFromText('sexting de 10 min').id).toBe('st_10min');
    expect(matchSextingTemplateFromText('el de 15')).not.toBeNull();
    expect(matchSextingTemplateFromText('5 min va').id).toBe('st_5min');
  });

  it('returns null for invalid duration', () => {
    expect(matchSextingTemplateFromText('sexting de 7 min')).toBeNull();
    expect(matchSextingTemplateFromText('sin duración')).toBeNull();
  });
});
