export type Locale = 'pl' | 'ru';
export type Localized = Record<Locale, string>;

export type Grade = 1 | 2 | 3 | 4 | 5;
export type Qualification = 'INF.03' | 'INF.04';

/** Дата в формате YYYY-MM-DD. */
export type IsoDate = string;
/** День года в формате MM-DD, без года. */
export type MonthDay = string;

/**
 * Код efektu kształcenia из podstawa programowa, например 'INF.03.3.5'.
 * Брендирован, чтобы его нельзя было перепутать с любой другой строкой.
 */
export type EffectCode = string & { readonly __brand: 'EffectCode' };

export type SubjectTrack =
  | { kind: 'ogolny' }
  | { kind: 'jezyk'; level: 'podstawowy' | 'rozszerzony' }
  | { kind: 'zawodowy'; qualification: Qualification; form: 'teoria' | 'pracownia' };

/**
 * Лицензии, совместимые с нашей CC BY-SA 4.0. Вариантов с NC здесь нет
 * намеренно: Pi-stacja и Khan Academy лежат под CC BY-NC-SA, и такой материал
 * нельзя объединять с SA на одной странице. Отсутствие варианта в типе делает
 * нарушение невозможным на этапе компиляции.
 */
export type EmbeddableLicense =
  | 'public-domain'
  | 'CC-BY-3.0'
  | 'CC-BY-SA-4.0'
  | 'LAL-1.3';

export type Source =
  | { kind: 'link-only'; provider: string; title: string; url: string; why: string }
  | {
      kind: 'embeddable';
      title: string;
      url: string;
      license: EmbeddableLicense;
      attribution: string;
    }
  | { kind: 'authored'; author: string; license: 'CC-BY-SA-4.0' };
