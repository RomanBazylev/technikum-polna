import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

declare global {
  interface Window {
    __spokenLanguages: string[];
  }
}

test('главная отдаётся и стили под подпутём разрешаются', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });

  await page.goto('./');
  await expect(page).toHaveTitle(/Dziś/);

  // Пустой экран прошёл бы ленивую проверку, поэтому смотрим на применённый
  // стиль, а не на наличие тега link.
  const background = await page.evaluate(() =>
    getComputedStyle(document.documentElement).backgroundColor,
  );
  expect(background).not.toBe('rgba(0, 0, 0, 0)');

  expect(failed, `запросы с ошибкой: ${failed.join(', ')}`).toEqual([]);
});

test('нижняя навигация ведёт на все четыре вкладки', async ({ page }) => {
  const tabs = [
    ['Nauka', 'nauka'],
    ['Egzaminy', 'egzaminy'],
    ['Szkoła', 'szkola'],
  ] as const;

  await page.goto('./');
  const nav = page.getByRole('navigation', { name: 'Główna nawigacja' });
  await expect(nav.getByRole('link')).toHaveCount(4);

  for (const [label, path] of tabs) {
    // Возврат через историю не успевал завершиться до следующего клика, и
    // нажатие терялось. Каждый переход начинается с главной и ждёт адрес.
    await page.goto('./');
    await nav.getByRole('link', { name: new RegExp(label) }).click();
    await page.waitForURL(new RegExp(`/${path}/$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
  }
});

test('остров обязанностей гидратируется и считает сроки', async ({ page }) => {
  await page.goto('./');
  const items = page.getByRole('listitem').filter({ hasText: 'Stypendium szkolne' });
  await expect(items.first()).toBeVisible();
  // Статус вычисляется в браузере, поэтому текст появляется только после
  // гидратации острова. Пустая карточка означала бы, что остров не ожил.
  await expect(items.first()).toContainText('art. 90n');
});

test('термин показывает перевод по нажатию и работает без JavaScript', async ({ page }) => {
  await page.goto('./nauka/');
  const term = page.locator('details.term').first();
  await expect(term).toBeVisible();

  const note = term.getByRole('note');
  await expect(note).toBeHidden();

  // Раскрытие нативное, поэтому клик не может опередить гидратацию острова.
  await term.locator('summary').click();
  await expect(note).toBeVisible();
});

test('польское произношение доступно и вызывает speechSynthesis', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__spokenLanguages', {
      configurable: true,
      value: [],
      writable: true,
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: class {
        lang = '';
        rate = 1;
        voice = null;

        constructor(readonly text: string) {}
      },
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        speak(utterance: SpeechSynthesisUtterance) {
          window.__spokenLanguages.push(utterance.lang);
        },
      },
    });
  });

  await page.goto('./szkola/');
  const control = page.getByRole('button', { name: /Wymowa: wychowawca/ });
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  await expect(async () => {
    await control.click();
    expect(await page.evaluate(() => window.__spokenLanguages)).toEqual(['pl-PL']);
  }).toPass({ timeout: 10_000 });
});

test('вкладки не подменяются главной после активации воркера', async ({ page }) => {
  // Сторож против конкретной поломки: без слеша в адресе сервис-воркер не
  // находил nauka/index.html среди закешированного и отдавал navigateFallback,
  // то есть главную. Для повторного визита это ломало всю навигацию.
  await page.goto('./');
  // Ожидание ограничено: если воркер почему-то не поднялся, проверять
  // навигацию всё равно надо, а зависать на полминуты незачем.
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return;
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
  });
  // Перезагрузка гарантирует, что страницей управляет воркер, а не сеть.
  await page.reload();

  await page.goto('./nauka/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nauka');

  await page.goto('./egzaminy/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Egzaminy');
});

test('калькулятор считает бюджет пропусков по уставу', async ({ page }) => {
  await page.goto('./kalkulatory/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kalkulatory');

  // 60 часов предмета, пропущено 8, значит до порога § 54 остаётся 22.
  await expect(page.getByText('22 godziny', { exact: true })).toBeVisible();
  await expect(page.getByText(/§ 54 ust. 1/)).toBeVisible();
});

test('калькулятор показывает, какая оценка нужна для цели', async ({ page }) => {
  await page.goto('./kalkulatory/');
  await page.getByLabel('Cel średniej').fill('4');
  await page.getByLabel('Waga przyszłej oceny').fill('3');
  await expect(page.getByText('Wystarczy 5, wyjdzie 4.29', { exact: true })).toBeVisible();
});

test('§58 сохраняется после перезагрузки', async ({ page }) => {
  await page.goto('./kalkulatory/');
  await expect(page.getByRole('heading', { name: 'Zachowanie · Поведение' })).toBeVisible();

  const addHour = page.getByRole('button', {
    name: 'godziny bez usprawiedliwienia: więcej',
  });
  await expect(addHour).toBeEnabled();
  await addHour.click();
  await expect(page.getByText('bardzo dobre', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('bardzo dobre', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem('tkk-polna:state');
        if (raw === null) return null;
        return JSON.parse(raw).calculators?.behaviourBudget ?? null;
      }),
    )
    .toEqual({ unexcusedHours: 1, lateArrivals: 0 });
});

test('страница экзаменов отличает профэкзамен от формулы матуры', async ({ page }) => {
  await page.goto('./egzaminy/');
  await expect(page.getByText(/Formule 2019/)).toBeVisible();
  await expect(page.getByText(/szkoła nie opublikowała jeszcze planu tego oddziału/)).toBeVisible();
});

test('экспорт и импорт сохраняет значения обоих калькуляторов', async ({ page }) => {
  await page.goto('./kalkulatory/');
  const points = page.getByLabel('Zdobyte punkty');
  const missed = page.getByLabel('Opuszczono razem');
  await expect(points).toBeEnabled();
  await expect(missed).toBeEnabled();
  await points.fill('23');
  await missed.fill('19');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Zapisz do pliku' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) throw new Error('Playwright nie udostępnił pliku eksportu');

  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(points).toHaveValue('18');
  await expect(missed).toHaveValue('8');

  await page.locator('input[type="file"]').setInputFiles(path);
  await expect(page.getByText('Dane wczytane. Данные загружены.')).toBeVisible();
  await page.reload();
  await expect(points).toHaveValue('23');
  await expect(missed).toHaveValue('19');
});

test('главная отвечает работающим числом до первого ввода', async ({ page }) => {
  // Сторож против возврата к списку чужих заявлений: гость, который ничего не
  // трогал, должен увидеть посчитанный ответ, а не приглашение заполнить анкету.
  await page.goto('./');
  const hero = page.getByRole('region').or(page.locator('section')).first();
  await expect(hero.getByText('wzorowe')).toBeVisible();
  await expect(page.getByText(/zbija na bardzo dobre, gdzie zapas to 7 godzin/)).toBeVisible();

  // Шаг счётчика меняет ответ сразу, без перезагрузки и без сохранения.
  await page.getByRole('button', { name: 'godziny bez usprawiedliwienia: więcej' }).click();
  await expect(page.getByText('bardzo dobre', { exact: true })).toBeVisible();
});

test('заполненный план превращает главную в сводку конкретного дня', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 9, 7, 30));
  await page.goto('./');
  await page.evaluate(() => {
    window.localStorage.setItem(
      'tkk-polna:state',
      JSON.stringify({
        version: 2,
        profile: { grade: 1, languageGroup: null, uiLocale: 'pl', birthDate: null },
        timetable: [
          { id: 'sr-1', day: 'sr', slot: 1, subjectId: 'fizyka', room: '204' },
          { id: 'czw-1', day: 'czw', slot: 1, subjectId: 'matematyka' },
        ],
        attendance: [],
        grades: [],
        homework: [],
        announcedTests: [
          {
            id: 'mat-test',
            subject: 'matematyka',
            date: '2026-09-09',
            announcedOn: '2026-09-06',
          },
        ],
        progress: {},
        teachers: [],
        settings: {
          theme: 'system',
          showRussian: true,
          bells: { firstLessonStart: 480, breakMinutes: 10 },
        },
      }),
    );
  });

  await page.reload();
  const hero = page.locator('section').first();
  await expect(hero.getByText('Następna lekcja · Следующий урок')).toBeVisible();
  await expect(hero.getByText('Fizyka', { exact: true })).toBeVisible();
  await expect(hero.getByText(/8:00 · sala 204/)).toBeVisible();
  await expect(hero.getByText(/Na czwartek · На четверг/)).toBeVisible();
  await expect(hero.getByText(/Matematyka i przykłady jej zastosowań/)).toBeVisible();
  await expect(hero.getByText(/Może naruszać § 52 ust. 4 pkt 3/)).toBeVisible();
  await expect(hero.getByText('wzorowe')).toHaveCount(0);
});

test('дата рождения вводится прямо на главной и раскрывает правила', async ({ page }) => {
  // Пустое состояние было тупиком: свёрнутый блок «нужны данные: 4» без единого
  // поля. Ввод должен стоять там же, где о нём просят.
  await page.goto('./');
  const invite = page.getByLabel(/Dwie zasady włączają się z wiekiem/);
  await expect(invite).toBeVisible();
  await invite.fill('2011-03-15');

  await expect(
    page.getByText('Legitymacja szkolna obowiązkowa w kontroli'),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem('tkk-polna:state');
        if (raw === null) return null;
        const saved = JSON.parse(raw);
        return saved.profile?.birthDate ?? null;
      }),
    )
    .toBe('2011-03-15');
});

test('обратный отсчёт ведёт в статью о первом сентября', async ({ page }) => {
  await page.goto('./');
  const pill = page.getByRole('link', { name: /września|Dziś zaczyna się rok/ });

  // Плашка сезонная: её нет большую часть года, и это не повод падать.
  if ((await pill.count()) === 0) return;
  await pill.click();
  await page.waitForURL(/\/szkola\/pierwszy-tydzien\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pierwszy tydzień');
});

test('дата рождения сохраняется и раскрывает возрастные правила', async ({ page }) => {
  await page.goto('./kalkulatory/');
  const birthDate = page.getByLabel(/Data urodzenia/);
  await birthDate.fill('2011-03-15');
  await expect(birthDate).toHaveValue('2011-03-15');

  // Состояние переживает переход между страницами, и правило с 16 лет
  // начинает считаться от даты, а не ждать её.
  await page.goto('./');
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Legitymacja szkolna obowiązkowa' }),
  ).toBeVisible();
  await expect(page.getByText('zależy od wieku')).toHaveCount(0);
});

test('справочник показывает статьи и словарь', async ({ page }) => {
  await page.goto('./szkola/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Szkoła');
  await expect(page.getByRole('button', { name: /Wymowa: wychowawca/ })).toBeVisible();

  // Двуязычность справочника обеспечивается схемой и валидатором, но проверим,
  // что русские версии действительно доехали до страницы.
  await expect(page.getByText('Права ученика-иностранца')).toBeVisible();

  await page.goto('./szkola/prawa-cudzoziemca/');
  await expect(page.getByText(/co najmniej 2 i najwyżej 5 godzin tygodniowo/)).toBeVisible();
  await expect(page.getByText(/\+30 minut/).first()).toBeVisible();

  await page.goto('./szkola/pieniadze-i-dojazd/');
  await expect(page.getByRole('cell', { name: 'Dobry Start' }).first()).toBeVisible();
  await expect(page.getByText(/Jeżeli rodzic ma stałe zameldowanie w Warszawie/)).toBeVisible();

  await page.goto('./szkola/kalendarz/');
  await expect(page.getByText('23–31 grudnia 2026', { exact: true }).first()).toBeVisible();
});

test('полка лектур собрана из Wolne Lektury и отмечает аудиокниги', async ({ page }) => {
  await page.goto('./lektury/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lektury');

  const links = page.locator('main a[href^="https://wolnelektury.pl"]');
  expect(await links.count()).toBeGreaterThan(50);
  await expect(page.getByText('audiobook').first()).toBeVisible();
});

test('весь функционал доступен с главной за один переход', async ({ page }) => {
  // Сторож против «на сайте пара плашек»: если ссылка на раздел пропадёт или
  // раздел перестанет открываться, тест это поймает раньше пользователя.
  // Пятой вкладки не будет, поэтому четыре инструмента обязаны стоять дверями
  // на главной, а не текстовой сноской внутри чужой страницы.
  await page.goto('./');
  for (const name of ['Plan', 'Kalkulatory', 'Warsztat', 'Lektury'] as const) {
    await expect(page.getByRole('link', { name: new RegExp(`^${name} ·`) })).toBeVisible();
  }

  for (const [path, heading] of [
    ['kalkulatory/', 'Kalkulatory'],
    ['lektury/', 'Lektury'],
    ['warsztat/', 'Warsztat'],
    ['plan/', 'Plan'],
    ['zasoby/', 'Zasoby'],
  ] as const) {
    await page.goto(`./${path}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
  }
});

const ROUTE_HEADINGS = [
  ['./', 'TKK Polna · 1B'],
  ['./nauka/', 'Nauka'],
  ['./egzaminy/', 'Egzaminy'],
  ['./szkola/', 'Szkoła'],
  ['./szkola/pierwszy-tydzien/', 'Pierwszy tydzień'],
  ['./szkola/zasady/', 'Zasady, które naprawdę obowiązują'],
  ['./szkola/prawa-cudzoziemca/', 'Prawa ucznia cudzoziemca'],
  ['./szkola/pieniadze-i-dojazd/', 'Pieniądze i dojazd'],
  ['./szkola/kalendarz/', 'Kalendarz roku 2026/2027'],
  ['./szkola/kontakt/', 'Kontakt i sprawy organizacyjne'],
  ['./plan/', 'Plan'],
  ['./kalkulatory/', 'Kalkulatory'],
  ['./lektury/', 'Lektury'],
  ['./zasoby/', 'Zasoby'],
  ['./warsztat/', 'Warsztat'],
] as const;
const ROUTES = ROUTE_HEADINGS.map(([route]) => route);

test('все страницы и их ресурсы отдаются без скрытых 404', async ({ page }) => {
  const failed = new Set<string>();
  page.on('response', (response) => {
    if (response.status() >= 400) failed.add(`${response.status()} ${response.url()}`);
  });

  for (const [route, heading] of ROUTE_HEADINGS) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
  }

  expect([...failed], `запросы с ошибкой: ${[...failed].join(', ')}`).toEqual([]);
});

test('каждая внутренняя ссылка заканчивается слешем', async ({ page }) => {
  // Это ломало продакшен: без слеша воркер не находит адрес среди
  // закешированного, срабатывает navigateFallback, и вкладка отдаёт главную.
  // Дисциплина уже один раз не сработала, поэтому теперь это ворота, а не
  // договорённость. Ссылки собираются и в .astro, и в .tsx, поэтому проверять
  // надо готовый DOM, а не исходники.
  const offenders: string[] = [];

  for (const route of ROUTES) {
    await page.goto(route);
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll('a[href]')]
        .map((node) => node.getAttribute('href') ?? '')
        .filter((href) => {
          if (href === '' || /^(https?:|mailto:|tel:|#)/.test(href)) return false;
          const path = href.split(/[?#]/)[0] ?? '';
          return !path.endsWith('/');
        }),
    );
    offenders.push(...bad.map((href) => `${route} -> ${href}`));
  }

  expect(offenders, `ссылки без слеша: ${offenders.join(', ')}`).toEqual([]);
});

test('песочница SQL реально выполняет запрос в браузере', async ({ page }) => {
  // Остров client:visible. Клик до гидратации попадает в мёртвую разметку,
  // таблица не появляется, и 30 секунд уходят в пустую. Повторяем запуск,
  // пока не начнётся загрузка движка.
  test.setTimeout(90_000);
  await page.goto('./warsztat/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Warsztat');

  const run = page.getByRole('button', { name: /Uruchom ·/ });
  await run.scrollIntoViewIfNeeded();
  await expect(async () => {
    await run.click();
    await expect(
      page.getByText('Ładowanie silnika bazy').or(page.getByRole('table')),
    ).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  await expect(page.getByRole('table')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('cell', { name: 'Adamczyk' })).toBeVisible();
});

test('песочница честно предупреждает о расхождениях с MySQL', async ({ page }) => {
  await page.goto('./warsztat/');
  await page.getByText('Czym to się różni od egzaminu').click();
  await expect(page.getByText('Sortowanie polskich liter')).toBeVisible();
  await expect(page.getByText(/Dzielenie całkowite/)).toBeVisible();
});

test('песочница показывает тихое деление SQLite и MySQL', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./warsztat/');

  const sql = page.getByLabel('Zapytanie SQL');
  const run = page.getByRole('button', { name: /Uruchom ·/ });
  await run.scrollIntoViewIfNeeded();
  await expect(async () => {
    await sql.fill('SELECT 5 / 2 AS sqlite_result;');
    await run.click();
    await expect(
      page.getByText('Ładowanie silnika bazy').or(page.getByRole('table')),
    ).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  const table = page.getByRole('table');
  await expect(table).toBeVisible({ timeout: 60_000 });
  await expect(table.getByRole('cell', { name: '2', exact: true })).toBeVisible();

  await page.getByText('Czym to się różni od egzaminu').click();
  await expect(page.getByText(/w MySQL 2\.5/)).toBeVisible();
});

/**
 * Разметка разбирается через DOMParser, которого нет при сборке, поэтому до
 * гидратации острова в рамке стоит заглушка. Ввод, обогнавший гидратацию,
 * затирается первым же рендером Preact, и тест ловил бы не то. Ожидание
 * первого разобранного виджета и есть признак ожившего острова.
 */
async function openLayoutEditor(page: Page) {
  await page.goto('./warsztat/');
  const editor = page.getByLabel('Kod układu');
  await editor.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('layout-frame').locator('[data-widget]').first()).toBeVisible();
  return editor;
}

test('предпросмотр разметки рисует виджет из вставленного XML', async ({ page }) => {
  const editor = await openLayoutEditor(page);

  await editor.fill(
    '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:orientation="vertical">' +
      '<Button android:text="Zaloguj mnie" android:layout_width="wrap_content" />' +
      '</LinearLayout>',
  );

  const frame = page.getByTestId('layout-frame');
  await expect(frame.getByText('Zaloguj mnie')).toBeVisible();
  // Пустая рамка прошла бы проверку на отсутствие ошибки, поэтому смотрим,
  // что виджет действительно разобран, а не просто выведен как текст.
  await expect(frame.locator('[data-widget="button"]')).toHaveCount(1);
});

test('пресет XAML рисует калькулятор оценок', async ({ page }) => {
  await openLayoutEditor(page);
  await page.getByRole('button', { name: /Kalkulator na XAML/ }).click();

  const frame = page.getByTestId('layout-frame');
  await expect(frame.getByText('Kalkulator ocen')).toBeVisible();
  await expect(frame.getByText('Policz średnią')).toBeVisible();
  await expect(frame.locator('[data-widget="field"]')).toHaveCount(2);
});

test('предпросмотр разметки показывает читаемую ошибку вместо пустой рамки', async ({ page }) => {
  const editor = await openLayoutEditor(page);

  await editor.fill('<LinearLayout><Button android:text="bez zamknięcia"></LinearLayout>');

  const failure = page.getByTestId('layout-error');
  await expect(failure).toBeVisible();
  await expect(failure).toContainText(/XML/);
  await expect(page.getByTestId('layout-frame').locator('[data-widget]')).toHaveCount(0);
});

/**
 * Тёмный фон редактора задан жёстко, а цвет букв наследуется от html и
 * переворачивается вместе со схемой. В светлой теме выходило чёрное по
 * чёрному: код лежал на месте, но прочитать его было нельзя, и ни один
 * тест на видимость этого не замечал.
 */
async function contrast(target: Locator): Promise<{ ratio: number; paint: string }> {
  const paint = await target.evaluate((node) => {
    const style = getComputedStyle(node);
    return { color: style.color, background: style.backgroundColor };
  });
  const luminance = (color: string): number => {
    const [red, green, blue] = (color.match(/\d+(?:\.\d+)?/g) ?? []).slice(0, 3).map((value) => {
      const share = Number(value) / 255;
      return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
  };
  const text = luminance(paint.color);
  const background = luminance(paint.background);
  return {
    ratio: (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05),
    paint: `${paint.color} на ${paint.background}`,
  };
}

test('код в песочницах читается в светлой теме', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./warsztat/');
  await page.getByLabel('Kod układu').scrollIntoViewIfNeeded();

  for (const surface of ['Zapytanie SQL', 'Kod układu'] as const) {
    const { ratio, paint } = await contrast(page.getByLabel(surface));
    expect(ratio, `${surface}: ${paint}`).toBeGreaterThanOrEqual(4.5);
  }

  const frame = await contrast(page.getByTestId('layout-frame'));
  expect(frame.ratio, `podgląd układu: ${frame.paint}`).toBeGreaterThanOrEqual(4.5);
});

test('тяжёлые движки не скачиваются до запуска SQL или подтверждения PHP', async ({ page }) => {
  // Движок весит мегабайты. Автозагрузка на мобильном интернете съела бы
  // пакет ученика, который зашёл посмотреть на другую песочницу.
  const heavy: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('cdn.jsdelivr.net') || url.endsWith('.wasm')) heavy.push(url);
  });

  await page.goto('./warsztat/');
  await page.getByLabel('Zapytanie SQL').scrollIntoViewIfNeeded();
  const gate = page.getByTestId('php-gate');
  await gate.scrollIntoViewIfNeeded();
  await expect(gate).toBeVisible();
  await expect(gate).toContainText(/MB/);
  await expect(gate.getByRole('button', { name: /Pobierz silnik PHP/ })).toBeVisible();
  await page.getByLabel('Kod układu').scrollIntoViewIfNeeded();
  await page.getByText('Przygotowanie obrazu · Подготовка изображения').scrollIntoViewIfNeeded();

  await page.waitForTimeout(1500);
  expect(heavy, `тяжёлое качалось без спроса: ${heavy.join(', ')}`).toEqual([]);
});

test('Canvas масштабирует PNG и скачивает JPEG нужной ширины', async ({ page }) => {
  await page.goto('./warsztat/');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAC0lEQVR4nGP4DwUAI+UH+Yo0eLMAAAAASUVORK5CYII=',
    'base64',
  );
  const heading = page.getByText('Przygotowanie obrazu · Подготовка изображения');
  await heading.scrollIntoViewIfNeeded();
  const input = page.locator('input[type="file"][accept="image/*"]');
  await expect(async () => {
    await input.setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: png,
    });
    await expect(page.getByText(/sample\.png: 2 × 1 px/)).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  await page.getByLabel('Szerokość docelowa, px').fill('200');
  await expect(page.getByText(/200 × 100 px/)).toBeVisible();
  await page.getByRole('button', { name: 'Przeskaluj' }).click();
  await expect(page.locator('canvas')).toHaveJSProperty('width', 200);
  await expect(page.locator('canvas')).toHaveJSProperty('height', 100);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Pobierz', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-200\.jpeg$/);
});

/**
 * Живые проверки держатся за флагом, потому что тянут 3,3 МБ с чужого CDN:
 * перед выпуском запускаются командой
 * PHP_LIVE=1 npx playwright test --project=desktop.
 */
test('PHP LIVE: песочница выполняет mysqli-код после подтверждения', async ({ page }) => {
  test.skip(process.env['PHP_LIVE'] === undefined, 'запускается вручную с PHP_LIVE=1');
  test.setTimeout(180_000);

  await page.goto('./warsztat/');
  const gate = page.getByTestId('php-gate');
  await gate.scrollIntoViewIfNeeded();
  await gate.getByRole('button', { name: /Pobierz silnik PHP/ }).click();

  const run = page.getByRole('button', { name: /Uruchom PHP/ });
  await expect(run).toBeVisible({ timeout: 150_000 });

  // Редактор PHP появляется только после загрузки движка, поэтому проверить
  // его на чёрное по чёрному можно лишь здесь.
  const editor = await contrast(page.getByLabel('Kod PHP'));
  expect(editor.ratio, `Kod PHP: ${editor.paint}`).toBeGreaterThanOrEqual(4.5);

  await run.click();

  const output = page.frameLocator('[data-testid="php-output"]');
  await expect(output.getByRole('listitem').first()).toBeVisible({ timeout: 60_000 });
  // Строки приходят из той же засеянной базы, что и песочница SQL, значит
  // работает и мост mysqli_query, и разбор ответа на стороне PHP.
  await expect(output.getByText('Cezary Adamczyk')).toBeVisible();
  await expect(page.getByTestId('php-errors')).toHaveCount(0);
});

test('PHP LIVE: OO, prepared statements и явные ошибки', async ({
  page,
}, testInfo) => {
  test.skip(process.env['PHP_LIVE'] === undefined, 'запускается вручную с PHP_LIVE=1');
  test.setTimeout(240_000);

  await page.goto('./warsztat/');
  const disclosure = page.getByTestId('php-disclosure');
  await disclosure.scrollIntoViewIfNeeded();
  await expect(disclosure).toContainText('To nie jest MySQL');
  await disclosure.screenshot({
    path: `src/lib/sandbox/php-disclosure-${testInfo.project.name}.png`,
  });

  const gate = page.getByTestId('php-gate');
  await gate.getByRole('button', { name: /Pobierz silnik PHP/ }).click();
  const editor = page.getByLabel('Kod PHP');
  const run = page.getByRole('button', { name: /Uruchom PHP/ });
  await expect(run).toBeVisible({ timeout: 150_000 });
  const output = page.frameLocator('[data-testid="php-output"]');

  await editor.fill(`<?php
$db = new mysqli("localhost", "root", "", "szkola");
$wynik = $db->query("SELECT imie, nazwisko FROM uczniowie ORDER BY id LIMIT 1");
$uczen = $wynik->fetch_assoc();
echo "OO: " . $uczen["imie"] . " " . $uczen["nazwisko"]
    . "; connect_errno=" . $db->connect_errno
    . "; connect_error=" . ($db->connect_error === null ? "NULL" : $db->connect_error)
    . "; errno=" . $db->errno;
`);
  await run.click();
  await expect(
    output.getByText('OO: Anna Zielinska; connect_errno=0; connect_error=NULL; errno=0'),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('php-errors')).toHaveCount(0);

  await editor.fill(`<?php
$db = mysqli_connect("localhost", "root", "", "szkola");
$stmt = mysqli_prepare($db, "SELECT imie, nazwisko FROM uczniowie WHERE klasa = ? ORDER BY nazwisko");
$klasa = "1B";
mysqli_stmt_bind_param($stmt, "s", $klasa);
mysqli_stmt_execute($stmt);
$wynik = mysqli_stmt_get_result($stmt);
echo "PREPARED:";
while ($row = mysqli_fetch_assoc($wynik)) echo " " . $row["imie"] . " " . $row["nazwisko"] . ";";
echo " rows=" . mysqli_num_rows($wynik);
mysqli_stmt_close($stmt);
`);
  await run.click();
  await expect(output.getByText(/PREPARED:.*Cezary Adamczyk.*rows=/)).toBeVisible({
    timeout: 60_000,
  });
  await page
    .getByTestId('php-output')
    .screenshot({ path: `src/lib/sandbox/php-prepared-result-${testInfo.project.name}.png` });
  await expect(page.getByTestId('php-errors')).toHaveCount(0);

  await editor.fill(`<?php
$db = new mysqli("localhost", "root", "", "szkola");
$nazwa = "programowanie testowe";
$godziny = 2;
$insert = $db->prepare("INSERT INTO przedmioty (nazwa, godziny) VALUES (?, ?)");
$insert->bind_param("si", $nazwa, $godziny);
$insert->execute();
$id = $insert->insert_id;
echo "WRITE: affected=" . $insert->affected_rows . "; link=" . $db->affected_rows . "; id=" . $id;

$select = $db->prepare("SELECT nazwa, godziny FROM przedmioty WHERE id = ?");
$select->bind_param("i", $id);
$select->execute();
$select->bind_result($odczytana_nazwa, $odczytane_godziny);
$fetched = $select->fetch();
echo "; BIND_RESULT: " . $odczytana_nazwa . "/" . $odczytane_godziny . "; fetched=" . ($fetched ? "true" : "false");

$type = $db->prepare("SELECT typeof(?)");
$liczba_jako_tekst = "2";
$type->bind_param("i", $liczba_jako_tekst);
$type->execute();
$type->bind_result($typ);
$type->fetch();
echo "; BIND_TYPE: " . $typ;
$insert->close();
$select->close();
$type->close();
$db->close();
`);
  await run.click();
  await expect(
    output.getByText(
      'WRITE: affected=1; link=1; id=5; BIND_RESULT: programowanie testowe/2; fetched=true; BIND_TYPE: integer',
    ),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('php-errors')).toHaveCount(0);

  await editor.fill(`<?php
$db = new mysqli("localhost", "root", "", "szkola");
$wynik = $db->query("SELECT nie_ma_takiej_kolumny FROM uczniowie");
echo $wynik === false ? "ERROR: " . $db->errno . " " . $db->error : "brak błędu";
`);
  await run.click();
  await expect(output.getByText(/ERROR: 1 .*nie_ma_takiej_kolumny/i)).toBeVisible({
    timeout: 60_000,
  });

  await editor.fill(`<?php
$db = new mysqli("localhost", "root", "", "szkola");
$db->multi_query("SELECT 1; SELECT 2");
`);
  await run.click();
  await expect(output.getByText(/BŁĄD: mysqli::multi_query nie działa w tej piaskownicy/)).toBeVisible(
    { timeout: 60_000 },
  );

  await editor.fill(`<?php
$db = mysqli_connect("localhost", "root", "", "szkola");
mysqli_multi_query($db, "SELECT 1; SELECT 2");
`);
  await run.click();
  await expect(output.getByText(/BŁĄD: mysqli_multi_query nie działa w tej piaskownicy/)).toBeVisible({
    timeout: 60_000,
  });
});

test('песочница PHP усиливает предупреждение на медленной связи', async ({ page }) => {
  // Обычный Chromium отдаёт effectiveType не всегда, а ветка про экономию
  // трафика адресована как раз тем, кого мы в тесте не увидим, поэтому
  // соединение подменяется до загрузки страницы.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true, effectiveType: '2g' },
    });
  });

  await page.goto('./warsztat/');
  const gate = page.getByTestId('php-gate');
  await gate.scrollIntoViewIfNeeded();
  await expect(gate).toContainText('oszczędzanie danych');
});

test('песочница PHP заранее раскрывает границы слоя совместимости', async ({ page }) => {
  await page.goto('./warsztat/');
  await expect(page.getByTestId('php-disclosure')).toContainText('vrzno');
  await page.getByText('Dokładne granice warstwy mysqli').click();
  await expect(page.getByText(/Warstwa zgodności, nie MySQL/)).toBeVisible();
  await expect(page.getByText(/Jedno polecenie/)).toBeVisible();
});

test('карта программы показывает сетку часов и единицы efektów', async ({ page }) => {
  await page.goto('./nauka/');
  // Профессиональный блок: 11/12/13/13/7, всего 56 часов за цикл.
  await expect(page.getByRole('cell', { name: '56', exact: true })).toBeVisible();
  await expect(page.getByText('INF.04.7').first()).toBeVisible();
  await expect(page.getByText(/Niepotwierdzone przez szkołę/).first()).toBeVisible();
});

test('вставленная сетка запускает план и переживает переход', async ({ page }) => {
  await page.goto('./plan/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan');

  const grid = [
    'Nr\tPon\tWt\tŚr\tCzw\tPt',
    '1\tFizyka\tFizyka\tFizyka\tFizyka\tFizyka',
    '2\tMatematyka\tPolski\tChemia\tMatematyka\tWF',
  ].join('\n');
  await page.getByLabel(/Tabela planu/).fill(grid);
  await expect(page.getByText(/Rozpoznano lekcji: 10/)).toBeVisible();
  await page.getByRole('button', { name: /Wczytaj plan/ }).click();
  await expect(page.getByText(/Wczytano 10 lekcji/)).toBeVisible();
  await expect(page.getByText(/Plan jest jeszcze pusty/)).toHaveCount(0);

  await page.goto('./');
  await page.goto('./plan/');
  await page.getByText(/Popraw pojedynczo/).click();
  await expect(page.getByLabel('Poniedziałek, lekcja 1')).toHaveValue('fizyka');

  // Непонятная ячейка блокирует замену целиком, а не тихо исчезает.
  await page.getByLabel(/Tabela planu/).fill('Nr\tPon\tWt\tŚr\tCzw\tPt\n1\tRobotyka\t\t\t\t');
  await expect(page.getByText(/Wt 1: Robotyka|Pon 1: Robotyka/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Zastąp zapisany plan/ })).toBeDisabled();
  await expect(page.getByLabel('Poniedziałek, lekcja 1')).toHaveValue('fizyka');
});

test('список вещей показывает учебник на следующий учебный день', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 8, 12, 0));
  await page.goto('./plan/');

  const grid = ['Nr\tPon\tWt\tŚr\tCzw\tPt', '1\t\t\tFizyka\t\t'].join('\n');
  await page.getByLabel(/Tabela planu/).fill(grid);
  await expect(page.getByText(/Rozpoznano lekcji: 1/)).toBeVisible();
  await page.getByRole('button', { name: /Wczytaj plan/ }).click();

  const packing = page.getByRole('heading', { name: /Na środę weź/ }).locator('..');
  await expect(packing.getByText('Fizyka 1, nowa edycja, WSiP', { exact: true })).toBeVisible();
  await expect(packing.getByText('Fizyka', { exact: true })).toBeVisible();
});

test('проверка законности ловит объявление за три дня', async ({ page }) => {
  await page.goto('./plan/');

  await page.getByLabel(/Data pracy/).fill('2026-10-14');
  await page.getByLabel(/Zapowiedziano/).fill('2026-10-11');
  await page.getByRole('button', { name: /Dodaj pracę/ }).click();

  // Номер пункта устава важнее пересказа: именно он весит в разговоре
  // с учителем, поэтому проверяем сам номер, а не формулировку.
  await expect(page.getByText('§ 52 ust. 4 pkt 3')).toBeVisible();
  await expect(page.getByText(/zapowiedź na 3 dni/)).toBeVisible();
});

test('справочник учителей остаётся в браузере и переживает переход', async ({ page }) => {
  await page.goto('./szkola/');
  await page.getByRole('button', { name: /Dodaj nauczyciela/ }).click();
  await page.getByPlaceholder('np. Beata Markulis').fill('Anna Kowalska');
  await page.getByPlaceholder('np. 204').fill('317');

  await page.goto('./');
  await page.goto('./szkola/');
  await expect(page.getByPlaceholder('np. Beata Markulis')).toHaveValue('Anna Kowalska');
  await expect(page.getByPlaceholder('np. 204')).toHaveValue('317');
});

test('состояние версии 1 доезжает до версии 2 без потерь', async ({ page }) => {
  await page.goto('./plan/');
  await page.evaluate(() => {
    window.localStorage.setItem(
      'tkk-polna:state',
      JSON.stringify({
        version: 1,
        profile: { grade: 2, languageGroup: 'niemiecki', uiLocale: 'pl', birthDate: '2010-05-01' },
        // Запись из версии 1 требовала только идентификатор, уроком стать не может.
        timetable: [{ id: 'legacy', subject: 'matematyka' }],
        attendance: [],
        grades: [{ id: 'g1', value: 5 }],
        homework: [],
        progress: { 'inf-03-3': 'known' },
        teachers: [],
        settings: { theme: 'dark', showRussian: false },
      }),
    );
  });

  await page.goto('./plan/');
  await page.getByText(/Popraw pojedynczo/).click();
  await page.getByLabel('Poniedziałek, lekcja 1').selectOption('chemia');

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem('tkk-polna:state') ?? 'null'),
  );
  expect(stored.version).toBe(2);
  expect(stored.timetable).toEqual([
    { id: 'pon-1', day: 'pon', slot: 1, subjectId: 'chemia' },
  ]);
  // Нечитаемая строка расписания ушла, а полугодовые данные остались на месте
  // и никуда не откатывались.
  expect(stored.grades).toEqual([{ id: 'g1', value: 5 }]);
  expect(stored.profile.birthDate).toBe('2010-05-01');
  expect(stored.settings.bells).toEqual({ firstLessonStart: 480, breakMinutes: 10 });

  const backups = await page.evaluate(() =>
    Object.keys(window.localStorage).filter((key) => key.startsWith('tkk-polna:state-backup:')),
  );
  expect(backups).toEqual([]);
});

test('каталог ресурсов собран и не ведёт к готовым ответам', async ({ page }) => {
  await page.goto('./zasoby/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Zasoby');

  await expect(page.getByRole('link', { name: /Pi-stacja/ })).toBeVisible();
  await expect(page.getByText(/CC BY-NC-SA/).first()).toBeVisible();
  // Источники из коллекций доезжают до страницы, а не теряются при сборке.
  await expect(page.getByRole('link', { name: 'Statut TKK' }).first()).toBeVisible();

  // Стоячее решение: списывалок здесь нет и не появится незаметной правкой.
  const cribs = page.locator(
    'a[href*="odrabiamy.pl"], a[href*="brainly.pl"], a[href*="gotowiec.pl"], a[href*="skul.pl"], a[href*="zadania.info"]',
  );
  expect(await cribs.count()).toBe(0);
});
