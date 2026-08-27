#!/usr/bin/env node
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Кладёт движок SQLite рядом с сайтом. Отдаём со своего домена, а не с чужого
 * CDN: одной внешней зависимостью в рантайме меньше. В предзагрузку воркера он
 * при этом не попадает, иначе первый визит стоил бы лишние 600 килобайт тому,
 * кто в песочницу вообще не зайдёт.
 */
const SOURCE = 'node_modules/sql.js/dist/sql-wasm.wasm';
const TARGET = 'public/sql-wasm.wasm';

mkdirSync(dirname(TARGET), { recursive: true });
copyFileSync(SOURCE, TARGET);

const kilobytes = Math.round(statSync(TARGET).size / 1024);
console.log(`Движок SQLite скопирован: ${TARGET}, ${kilobytes} КБ, вне предзагрузки.`);
