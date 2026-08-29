import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { handbookSchema } from './lib/content/handbookSchema';

const invalidHandbook = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../scripts/fixtures/invalid-handbook.json', import.meta.url)),
    'utf8',
  ),
);

describe('schemat treści', () => {
  it('odrzuca celowo uszkodzony dokument podręcznika', () => {
    const result = handbookSchema.safeParse(invalidHandbook);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({ path: ['title'], code: 'too_small' }),
    );
  });
});
