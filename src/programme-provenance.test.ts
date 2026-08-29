import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const extractorTests = fileURLToPath(
  new URL('../scripts/extract-programme-provenance.test.py', import.meta.url),
);
const validator = fileURLToPath(new URL('../scripts/validate-content.mjs', import.meta.url));

describe('pochodzenie mapy programu', () => {
  it('uruchamia testy parsera ORE w bramce npm test', () => {
    const result = spawnSync('python', [extractorTests], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    });

    expect(result.stderr).toContain('Ran 2 tests');
    expect(result.status, result.stderr || result.stdout).toBe(0);
  }, 30_000);

  it('waliduje pełne powiązanie efektów i tematów', () => {
    const result = spawnSync(process.execPath, [validator], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    });

    expect(result.stdout).toContain('подробных эффектов: 119, тем карты: 119');
    expect(result.status, result.stderr || result.stdout).toBe(0);
  }, 30_000);
});
