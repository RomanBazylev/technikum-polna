#!/usr/bin/env node
import { readFile, readdir, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const effectsPath = new URL('../content/effects.json', import.meta.url);
const subjectsPath = new URL('../content/subjects.json', import.meta.url);
const topicsDirectory = new URL('../content/topics/pl/', import.meta.url);
const topicsPath = fileURLToPath(topicsDirectory);

const oreSource = {
  kind: 'embeddable',
  title: 'Podstawa programowa: technik programista 351406',
  url: 'https://ore.edu.pl/wp-content/uploads/2020/03/technik-programista.pdf',
  license: 'public-domain',
  attribution: 'ORE, Dz.U. 2019 poz. 991, załącznik nr 28; art. 4 pkt 1 ustawy o prawie autorskim.',
};

const schoolProgrammeSource = {
  title: 'Szkolny zestaw programów nauczania obowiązujący od roku szkolnego 2026/2027',
  url: 'https://technikumpolna.pl/wp-content/uploads/2026/07/Szkolny-zestaw-programow-nauczania-2026.pdf',
  documentDate: null,
  retrievedAt: '2026-08-28',
  scope: 'subject',
  status: 'confirmed',
};

const frameworkSource = {
  title: 'Rozporządzenie Ministra Edukacji z dnia 22 lipca 2026 r. w sprawie ramowych planów nauczania dla publicznych szkół',
  url: 'https://api.sejm.gov.pl/eli/acts/DU/2026/1028/text.pdf',
  documentDate: '2026-07-22',
  retrievedAt: '2026-08-29',
  scope: 'hours',
  status: 'framework',
};

const schoolOfferSource = {
  title: 'Technik programista',
  url: 'https://technikumpolna.pl/offer/programmer-technician/',
  documentDate: null,
  retrievedAt: '2026-08-28',
  scope: 'track',
  status: 'confirmed',
};

const schoolTextbooksSource = {
  title: 'Podręczniki i programy nauczania na rok szkolny 2026/2027',
  url: 'https://technikumpolna.pl/for-student/textbooks/',
  documentDate: null,
  retrievedAt: '2026-08-29',
  scope: 'textbook',
  status: 'confirmed',
};

const confirmedFrameworkHours = new Map([
  ['jezyk-polski', [3, 3, 3, 3, 4]],
  ['matematyka', [2, 3, 3, 3, 3]],
  ['historia', [1, 1, 2, 2, 1]],
  ['informatyka', [2, 1, 0, 0, 0]],
  ['edukacja-dla-bezpieczenstwa', [1, 0, 0, 0, 0]],
  ['wychowanie-fizyczne', [3, 3, 3, 3, 3]],
  ['ksztalcenie-zawodowe', [11, 12, 13, 13, 7]],
]);

function yamlQuote(value) {
  return JSON.stringify(value);
}

function slugFor(effectId, text) {
  const words = text
    .toLocaleLowerCase('pl')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .slice(0, 8)
    .join('-');
  return `${effectId.toLocaleLowerCase('pl').replaceAll('.', '-')}-${words}.md`;
}

function subjectFor(unit) {
  return unit.subjects[0]
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function topicMarkdown(unit, effect, index) {
  const grade = unit.grades[index % unit.grades.length];
  return `---
title: ${yamlQuote(effect.text)}
subject: ${subjectFor(unit)}
grade: ${grade}
effects:
  - ${effect.id}
terms: []
mappingStatus: unconfirmed
mappingNote:
  pl: ${yamlQuote('Klasa i przedmiot są roboczym przypisaniem. Publiczny plan szkoły nie podaje tego podziału.')}
  ru: ${yamlQuote('Класс и предмет указаны как рабочая привязка. Публичный план школы не содержит этого распределения.')}
sources:
  - kind: ${oreSource.kind}
    title: ${yamlQuote(oreSource.title)}
    url: ${oreSource.url}
    license: ${oreSource.license}
    attribution: ${yamlQuote(oreSource.attribution)}
reviewBy: 2028-08-28
---

**Efekt z podstawy programowej:** "${effect.text}".

To pozycja mapy programu, nie autorski materiał lekcyjny. Przypisanie do klasy i przedmiotu pozostaje niepotwierdzone do czasu publikacji szkolnego planu nauczania.

**По-русски:** это пункт карты программы, а не авторский урок. Привязка к классу и предмету не подтверждена, пока школа не опубликует учебный план.
`;
}

async function buildSubjects() {
  const subjects = JSON.parse(await readFile(subjectsPath, 'utf8'));
  const output = subjects.map((subject) => {
    const fixedHours = confirmedFrameworkHours.get(subject.id);
    const mappingStatus = fixedHours === undefined ? 'unconfirmed' : 'framework';
    const mappingNote =
      mappingStatus === 'framework'
        ? {
            pl: 'Wymiar wynika z ramowego planu dla technikum, nie z opublikowanego planu oddziału Polnej.',
            ru: 'Объём взят из рамочного плана техникума, а не из опубликованного плана класса Polna.',
          }
        : {
            pl: 'Szkoła potwierdza przedmiot lub program, ale nie publikuje jego rozkładu godzin między klasami.',
            ru: 'Школа подтверждает предмет или программу, но не публикует распределение часов по классам.',
          };
    const sources = [schoolProgrammeSource, frameworkSource];
    if (subject.track === 'rozszerzony' || subject.track === 'jezyk') {
      sources.push(schoolOfferSource);
    }
    if (subject.textbook !== undefined) {
      sources.push(schoolTextbooksSource);
    }
    return {
      ...subject,
      hoursByGrade: fixedHours ?? null,
      mappingStatus,
      mappingNote,
      sources,
    };
  });
  await writeFile(subjectsPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
}

async function buildTopics() {
  const units = JSON.parse(await readFile(effectsPath, 'utf8'));
  await mkdir(topicsDirectory, { recursive: true });
  for (const file of await readdir(topicsDirectory)) {
    if (file.endsWith('.md')) {
      await rm(join(topicsPath, file));
    }
  }
  for (const unit of units) {
    for (const [index, effect] of unit.effects.entries()) {
      const path = new URL(slugFor(effect.id, effect.text), topicsDirectory);
      await writeFile(path, topicMarkdown(unit, effect, index), 'utf8');
    }
  }
  const total = units.reduce((sum, unit) => sum + unit.effects.length, 0);
  console.log(`Wrote ${total} sourced programme-map topics.`);
}

await Promise.all([buildSubjects(), buildTopics()]);
