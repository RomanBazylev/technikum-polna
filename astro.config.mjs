import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';

const BASE = '/technikum-polna/';

export default defineConfig({
  site: 'https://romanbazylev.github.io',
  base: BASE,
  trailingSlash: 'ignore',
  // Preact вместо React: два маленьких острова не стоят 180 килобайт рантайма,
  // а бюджет первой загрузки на мобильном интернете - 300 килобайт на всё.
  integrations: [preact()],
  vite: {
    plugins: [tailwindcss()],
  },
});
