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
  await page.goto('./');
  const nav = page.getByRole('navigation', { name: 'Główna nawigacja' });
  await expect(nav.getByRole('link')).toHaveCount(4);

  for (const label of ['Nauka', 'Egzaminy', 'Szkoła']) {
    await nav.getByRole('link', { name: new RegExp(label) }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
    await page.goBack();
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

test('термин показывает перевод по нажатию', async ({ page }) => {
  await page.goto('./nauka');
  const term = page.locator('button.term').first();
  await expect(term).toBeVisible();
  await term.click();
  await expect(page.getByRole('note')).toBeVisible();
});

test('справочник показывает словарь', async ({ page }) => {
  await page.goto('./szkola');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Szkoła');
  await expect(page.getByText('wychowawca')).toBeVisible();
});
