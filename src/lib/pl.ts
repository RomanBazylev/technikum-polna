/**
 * Польские числительные различают три формы, и подстановка не той сразу выдаёт
 * машинный текст носителю языка: «5 godziny» читается как ошибка, а не как
 * опечатка. Форма выбирается по последней цифре, кроме подростковых 12-14.
 */
function plural(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count);
  if (abs === 1) return one;
  const lastTwo = abs % 100;
  const last = abs % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

export function dni(count: number): string {
  return `${count} ${plural(count, 'dzień', 'dni', 'dni')}`;
}

export function godzin(count: number): string {
  return `${count} ${plural(count, 'godzina', 'godziny', 'godzin')}`;
}

export function spoznien(count: number): string {
  return `${count} ${plural(count, 'spóźnienie', 'spóźnienia', 'spóźnień')}`;
}
