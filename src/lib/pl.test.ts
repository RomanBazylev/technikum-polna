import { describe, expect, it } from 'vitest';
import { dni, godzin, spoznien } from './pl';

describe('польские числительные', () => {
  it('единственное число только у единицы', () => {
    expect(dni(1)).toBe('1 dzień');
    expect(godzin(1)).toBe('1 godzina');
  });

  it('форма few для 2-4', () => {
    expect(godzin(3)).toBe('3 godziny');
    expect(spoznien(4)).toBe('4 spóźnienia');
  });

  it('форма many от пяти', () => {
    expect(godzin(5)).toBe('5 godzin');
    expect(dni(11)).toBe('11 dni');
  });

  it('подростковые 12-14 идут в many, а не в few', () => {
    expect(godzin(12)).toBe('12 godzin');
    expect(godzin(13)).toBe('13 godzin');
    expect(godzin(14)).toBe('14 godzin');
  });

  it('после двадцати цикл повторяется', () => {
    expect(godzin(22)).toBe('22 godziny');
    expect(godzin(25)).toBe('25 godzin');
    expect(godzin(112)).toBe('112 godzin');
  });

  it('ноль идёт в many', () => {
    expect(godzin(0)).toBe('0 godzin');
  });
});
