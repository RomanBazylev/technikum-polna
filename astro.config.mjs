import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';

const BASE = '/technikum-polna/';

export default defineConfig({
  site: 'https://romanbazylev.github.io',
  base: BASE,
  // Слеш обязателен. Без него сервис-воркер не находит /nauka среди
  // закешированных путей (там лежит nauka/index.html), срабатывает
  // navigateFallback, и при повторном визите все вкладки отдают главную.
  trailingSlash: 'always',
  // Preact вместо React: два маленьких острова не стоят 180 килобайт рантайма,
  // а бюджет первой загрузки на мобильном интернете - 300 килобайт на всё.
  integrations: [preact()],
  vite: {
    plugins: [tailwindcss()],
  },
});
