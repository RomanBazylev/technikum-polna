import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BELLS,
  formatMinutes,
  lessonAt,
  lessonId,
  lessonsOn,
  nextLesson,
  parseTimetableGrid,
  schoolDayAfter,
  slotWindow,
  whatToBring,
  type BellConfig,
  type Lesson,
  type SubjectRef,
} from './timetable';

const lesson = (day: Lesson['day'], slot: number, subjectId: string): Lesson => ({
  id: lessonId(day, slot),
  day,
  slot,
  subjectId,
});

const week: Lesson[] = [
  lesson('pon', 1, 'matematyka'),
  lesson('pon', 2, 'jezyk-polski'),
  lesson('sr', 3, 'fizyka'),
  lesson('sr', 4, 'matematyka'),
  lesson('pt', 1, 'wychowanie-fizyczne'),
];

const subjects: SubjectRef[] = [
  { id: 'matematyka', pl: 'Matematyka', ru: 'Математика', textbook: 'Matematyka 1, Podkowa' },
  { id: 'fizyka', pl: 'Fizyka', ru: 'Физика', textbook: 'Fizyka 1, WSiP' },
  { id: 'jezyk-polski', pl: 'Język polski', ru: 'Польский', textbook: 'Przeszłość i dziś, Stentor' },
  { id: 'wychowanie-fizyczne', pl: 'Wychowanie fizyczne', ru: 'Физкультура' },
  { id: 'chemia', pl: 'Chemia', ru: 'Химия', textbook: 'Matematyka 1, Podkowa' },
];

describe('сетка звонков', () => {
  it('первый урок начинается тогда, когда сказал ученик', () => {
    expect(slotWindow(1, DEFAULT_BELLS)).toEqual({ start: 480, end: 525 });
  });

  it('каждый следующий сдвигается на урок плюс перемену', () => {
    expect(slotWindow(3, DEFAULT_BELLS)).toEqual({ start: 590, end: 635 });
  });

  it('другая перемена двигает всю сетку', () => {
    const longer: BellConfig = { firstLessonStart: 8 * 60 + 15, breakMinutes: 15 };
    expect(formatMinutes(slotWindow(2, longer).start)).toBe('9:15');
  });

  it('время печатается без ведущего нуля в часах, но с нулём в минутах', () => {
    expect(formatMinutes(480)).toBe('8:00');
    expect(formatMinutes(9 * 60 + 5)).toBe('9:05');
  });
});

describe('поиск урока в клетке', () => {
  it('находит по дню и номеру', () => {
    expect(lessonAt(week, 'sr', 3)?.subjectId).toBe('fizyka');
  });

  it('на пустой клетке отдаёт null, а не бросает', () => {
    expect(lessonAt(week, 'wt', 1)).toBeNull();
  });

  it('уроки дня возвращаются по возрастанию номера', () => {
    const shuffled = [lesson('wt', 5, 'chemia'), lesson('wt', 2, 'fizyka')];
    expect(lessonsOn(shuffled, 'wt').map((item) => item.slot)).toEqual([2, 5]);
  });
});

describe('импорт недельной сетки', () => {
  it('разбирает TSV из электронной таблицы с номерами и временем', () => {
    const payload = [
      'Nr\tGodzina\tPoniedziałek\tWtorek\tŚroda\tCzwartek\tPiątek',
      '1\t8:00–8:45\tMatematyka\tJęzyk polski\tFizyka\tChemia\tWF',
      '2\t8:55–9:40\tPolski\t—\tматематика\t\tWychowanie fizyczne',
    ].join('\n');

    expect(parseTimetableGrid(payload, subjects)).toEqual({
      kind: 'preview',
      lessons: [
        lesson('pon', 1, 'matematyka'),
        lesson('wt', 1, 'jezyk-polski'),
        lesson('sr', 1, 'fizyka'),
        lesson('czw', 1, 'chemia'),
        lesson('pt', 1, 'wychowanie-fizyczne'),
        lesson('pon', 2, 'jezyk-polski'),
        lesson('sr', 2, 'matematyka'),
        lesson('pt', 2, 'wychowanie-fizyczne'),
      ],
      unknown: [],
    });
  });

  it('разбирает сетку с точкой с запятой и номером в первом столбце', () => {
    const payload = [
      ';Pon;Wt;Śr;Czw;Pt',
      '1.;Matematyka;Fizyka;;;Chemia',
    ].join('\n');
    const result = parseTimetableGrid(payload, subjects);

    expect(result.kind).toBe('preview');
    if (result.kind !== 'preview') throw new Error('ожидался предпросмотр');
    expect(result.lessons).toEqual([
      lesson('pon', 1, 'matematyka'),
      lesson('wt', 1, 'fizyka'),
      lesson('pt', 1, 'chemia'),
    ]);
  });

  it('принимает markdown-таблицу с русскими заголовками', () => {
    const payload = [
      '| № | Понедельник | Вторник | Среда | Четверг | Пятница |',
      '|---|---|---|---|---|---|',
      '| 1 | Математика | Физика | Польский | Химия | Физкультура |',
    ].join('\n');
    const result = parseTimetableGrid(payload, subjects);

    expect(result.kind).toBe('preview');
    if (result.kind !== 'preview') throw new Error('ожидался предпросмотр');
    expect(result.lessons).toHaveLength(5);
    expect(result.unknown).toEqual([]);
  });

  it('не скрывает непонятную клетку за частично успешным разбором', () => {
    const payload = [
      'Nr\tPon\tWt\tŚr\tCzw\tPt',
      '1\tMatematyka\tRobotyka\t\t\t',
    ].join('\n');
    const result = parseTimetableGrid(payload, subjects);

    expect(result.kind).toBe('preview');
    if (result.kind !== 'preview') throw new Error('ожидался предпросмотр');
    expect(result.lessons).toEqual([lesson('pon', 1, 'matematyka')]);
    expect(result.unknown).toEqual([{ day: 'wt', slot: 1, value: 'Robotyka' }]);
  });

  it('отвергает список без заголовка пяти дней, чтобы не сдвинуть колонки', () => {
    expect(parseTimetableGrid('1\tMatematyka\tFizyka', subjects).kind).toBe('error');
  });
});

describe('ближайший урок', () => {
  // Даты собираются локальным конструктором: расписание живёт по часам
  // устройства ученика, а не по UTC.
  const at = (year: number, month: number, day: number, hour: number, minute: number): Date =>
    new Date(year, month - 1, day, hour, minute);

  it('во время урока считает минуты до конца', () => {
    const outcome = nextLesson(at(2026, 9, 7, 8, 30), week, DEFAULT_BELLS);
    expect(outcome).toEqual({ kind: 'during', lesson: week[0], minutesLeft: 15 });
  });

  it('до начала дня ведёт к первому уроку', () => {
    const outcome = nextLesson(at(2026, 9, 7, 7, 20), week, DEFAULT_BELLS);
    expect(outcome).toEqual({ kind: 'upcoming', lesson: week[0], minutesUntil: 40 });
  });

  it('на перемене ведёт к следующему уроку того же дня', () => {
    // Первый урок кончился в 8:45, второй начнётся в 8:55.
    const outcome = nextLesson(at(2026, 9, 7, 8, 50), week, DEFAULT_BELLS);
    expect(outcome).toEqual({ kind: 'upcoming', lesson: week[1], minutesUntil: 5 });
  });

  it('после последнего урока перелистывает на следующий учебный день', () => {
    // Понедельник, 16:00. Ближайший урок - среда, третий, начало в 9:50.
    const outcome = nextLesson(at(2026, 9, 7, 16, 0), week, DEFAULT_BELLS);
    expect(outcome).toEqual({
      kind: 'upcoming',
      lesson: week[2],
      minutesUntil: 2 * 1440 - 960 + 590,
    });
  });

  it('в выходные ведёт к понедельнику, а не к субботе', () => {
    // Суббота, 12:00. До понедельника 8:00 остаётся 44 часа.
    const outcome = nextLesson(at(2026, 9, 12, 12, 0), week, DEFAULT_BELLS);
    expect(outcome).toEqual({ kind: 'upcoming', lesson: week[0], minutesUntil: 44 * 60 });
  });

  it('вечером пятницы перескакивает через выходные', () => {
    const outcome = nextLesson(at(2026, 9, 11, 20, 0), week, DEFAULT_BELLS);
    expect(outcome).toEqual({ kind: 'upcoming', lesson: week[0], minutesUntil: 3 * 1440 - 1200 + 480 });
  });

  it('единственный урок недели находится и за неделю вперёд', () => {
    const single = [lesson('pon', 1, 'matematyka')];
    const outcome = nextLesson(at(2026, 9, 7, 10, 0), single, DEFAULT_BELLS);
    expect(outcome).toEqual({ kind: 'upcoming', lesson: single[0], minutesUntil: 7 * 1440 - 600 + 480 });
  });

  it('на пустом расписании ничего не выдумывает', () => {
    expect(nextLesson(at(2026, 9, 7, 10, 0), [], DEFAULT_BELLS)).toEqual({ kind: 'empty' });
  });
});

describe('следующий учебный день', () => {
  it('в понедельник это вторник', () => {
    expect(schoolDayAfter(new Date(2026, 8, 7, 18, 0))).toBe('wt');
  });

  it('в пятницу это понедельник', () => {
    expect(schoolDayAfter(new Date(2026, 8, 11, 18, 0))).toBe('pon');
  });

  it('в воскресенье это понедельник', () => {
    expect(schoolDayAfter(new Date(2026, 8, 13, 18, 0))).toBe('pon');
  });
});

describe('что взять в этот день', () => {
  it('в среду есть физика, значит нужен учебник физики', () => {
    expect(whatToBring('sr', week, subjects)).toEqual([
      { textbook: 'Fizyka 1, WSiP', subjects: ['Fizyka'] },
      { textbook: 'Matematyka 1, Podkowa', subjects: ['Matematyka'] },
    ]);
  });

  it('один учебник на два предмета попадает в список один раз', () => {
    const shared = [lesson('wt', 1, 'matematyka'), lesson('wt', 2, 'chemia')];
    expect(whatToBring('wt', shared, subjects)).toEqual([
      { textbook: 'Matematyka 1, Podkowa', subjects: ['Matematyka', 'Chemia'] },
    ]);
  });

  it('два урока одного предмета не удваивают книгу', () => {
    const twice = [lesson('wt', 1, 'fizyka'), lesson('wt', 4, 'fizyka')];
    expect(whatToBring('wt', twice, subjects)).toEqual([
      { textbook: 'Fizyka 1, WSiP', subjects: ['Fizyka'] },
    ]);
  });

  it('предмет без учебника ничего не добавляет', () => {
    expect(whatToBring('pt', week, subjects)).toEqual([]);
  });

  it('предмет, которого нет в коллекции, молча пропускается', () => {
    const unknown = [lesson('wt', 1, 'przedmiot-ktorego-nie-ma')];
    expect(whatToBring('wt', unknown, subjects)).toEqual([]);
  });

  it('пустой день не требует ничего', () => {
    expect(whatToBring('czw', week, subjects)).toEqual([]);
  });
});
