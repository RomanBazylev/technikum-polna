import { describe, expect, it } from 'vitest';
import { analyzeSql } from './phpEngine';

describe('analiza SQL dla mostu mysqli', () => {
  it('liczy parametry poza literałami i komentarzami', () => {
    const analysis = analyzeSql(`
      SELECT '?', "?", kolumna
      FROM uczniowie
      WHERE klasa = ? AND nazwisko = ?
      -- pytajnik ? w komentarzu
      /* i jeszcze ? tutaj */
    `);

    expect(analysis.placeholderCount).toBe(2);
    expect(analysis.hasMultipleStatements).toBe(false);
  });

  it('dopuszcza pojedynczy średnik kończący zapytanie', () => {
    expect(analyzeSql('SELECT * FROM uczniowie; -- koniec').hasMultipleStatements).toBe(false);
  });

  it('wykrywa drugie polecenie poza literałem', () => {
    expect(analyzeSql("SELECT ';' AS znak; DELETE FROM uczniowie").hasMultipleStatements).toBe(true);
  });

  it('nie traktuje średnika w komentarzu jako drugiego polecenia', () => {
    expect(analyzeSql('SELECT 1 /* ; SELECT 2 */;').hasMultipleStatements).toBe(false);
  });
});
