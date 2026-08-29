import { describe, expect, it } from 'vitest';
import { findPolishVoice } from './Speak';

describe('wybór głosu wymowy', () => {
  it('wybiera polski głos niezależnie od wielkości liter w kodzie języka', () => {
    const voices = [{ lang: 'en-US' }, { lang: 'PL-pl' }, { lang: 'ru-RU' }];

    expect(findPolishVoice(voices)).toBe(voices[1]);
  });

  it('zwraca brak głosu, gdy przeglądarka nie ma polskiego', () => {
    expect(findPolishVoice([{ lang: 'en-US' }, { lang: 'ru-RU' }])).toBeUndefined();
    expect(findPolishVoice([])).toBeUndefined();
  });
});
