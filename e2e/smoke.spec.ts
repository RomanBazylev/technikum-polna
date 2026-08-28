import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

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
  await expect(page.getByText('Możesz opuścić jeszcze 22 godz.')).toBeVisible();
  await expect(page.getByText(/§ 54 ust. 1/)).toBeVisible();
});

test('дата рождения сохраняется и раскрывает возрастные правила', async ({ page }) => {
  await page.goto('./kalkulatory/');
  const birthDate = page.locator('input[type="date"]');
  await birthDate.fill('2011-03-15');
  await expect(birthDate).toHaveValue('2011-03-15');

  // Состояние переживает переход между страницами, и правило с 16 лет
  // перестаёт висеть в разделе «нужны данные».
  await page.goto('./');
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Legitymacja szkolna obowiązkowa' }),
  ).toBeVisible();
});

test('справочник показывает статьи и словарь', async ({ page }) => {
  await page.goto('./szkola/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Szkoła');
  await expect(page.getByText('wychowawca').first()).toBeVisible();

  // Двуязычность справочника обеспечивается схемой и валидатором, но проверим,
  // что русские версии действительно доехали до страницы.
  await expect(page.getByText('Права ученика-иностранца')).toBeVisible();
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
  await page.goto('./');
  await expect(page.getByRole('link', { name: /Kalkulatory/ })).toBeVisible();

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

test('песочница SQL реально выполняет запрос в браузере', async ({ page }) => {
  await page.goto('./warsztat/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Warsztat');

  await page.getByRole('button', { name: /Uruchom/ }).click();

  // Движок весит 640 КБ и грузится по требованию, поэтому ждём дольше обычного.
  await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('cell', { name: 'Adamczyk' })).toBeVisible();
});

test('песочница честно предупреждает о расхождениях с MySQL', async ({ page }) => {
  await page.goto('./warsztat/');
  await page.getByText('Czym to się różni od egzaminu').click();
  await expect(page.getByText('Sortowanie polskich liter')).toBeVisible();
  await expect(page.getByText(/Dzielenie całkowite/)).toBeVisible();
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

test('песочница PHP не качает ни байта до подтверждения ученика', async ({ page }) => {
  // Движок весит мегабайты. Автозагрузка на мобильном интернете съела бы
  // пакет ученика, который зашёл посмотреть на другую песочницу.
  const heavy: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('cdn.jsdelivr.net') || url.endsWith('.wasm')) heavy.push(url);
  });

  await page.goto('./warsztat/');
  const gate = page.getByTestId('php-gate');
  await gate.scrollIntoViewIfNeeded();
  await expect(gate).toBeVisible();
  await expect(gate).toContainText(/MB/);
  await expect(gate.getByRole('button', { name: /Pobierz silnik PHP/ })).toBeVisible();

  await page.waitForTimeout(1500);
  expect(heavy, `тяжёлое качалось без спроса: ${heavy.join(', ')}`).toEqual([]);
});

/**
 * Единственная проверка, доказывающая, что PHP правда выполняется. Держится
 * за флагом, потому что тянет 3,3 МБ с чужого CDN: в обычном прогоне это
 * лишние минуты и чужая доступность, а перед выпуском запускается руками
 * командой PHP_LIVE=1 npx playwright test --project=desktop.
 */
test('песочница PHP выполняет mysqli-код после подтверждения', async ({ page }) => {
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

test('песочница PHP предупреждает о подготовленных запросах заранее', async ({ page }) => {
  await page.goto('./warsztat/');
  await page.getByText('Czego ta piaskownica nie umie').click();
  await expect(page.getByText('Brak przygotowanych zapytań')).toBeVisible();
  await expect(page.getByText(/Pod spodem jest SQLite/)).toBeVisible();
});

test('карта программы показывает сетку часов и единицы efektów', async ({ page }) => {
  await page.goto('./nauka/');
  // Профессиональный блок: 11/12/13/13/7, всего 56 часов за цикл.
  await expect(page.getByRole('cell', { name: '56', exact: true })).toBeVisible();
  await expect(page.getByText('INF.04.7').first()).toBeVisible();
});

test('расписание переживает переход между страницами', async ({ page }) => {
  await page.goto('./plan/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan');

  // Поле включается только после загрузки состояния, поэтому ожидание
  // гидратации острова обеспечено самим селектором.
  await page.getByLabel('Poniedziałek, lekcja 1').selectOption('fizyka');

  await page.goto('./');
  await page.goto('./plan/');
  await expect(page.getByLabel('Poniedziałek, lekcja 1')).toHaveValue('fizyka');
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
    'a[href*="odrabiamy.pl"], a[href*="brainly.pl"], a[href*="gotowiec.pl"], a[href*="skul.pl"]',
  );
  expect(await cribs.count()).toBe(0);
});
