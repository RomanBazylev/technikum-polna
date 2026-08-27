import { expect, test } from '@playwright/test';

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
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
  });

  await page.goto('./nauka/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nauka');

  await page.goto('./egzaminy/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Egzaminy');
});

test('справочник показывает словарь', async ({ page }) => {
  await page.goto('./szkola/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Szkoła');
  await expect(page.getByText('wychowawca')).toBeVisible();
});
