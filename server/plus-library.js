/**
 * Plus reading and education libraries.
 * Served only by the account API. The static file handler does not expose them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const NON_LEAP_MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

let cache = null;

function readJsArray(file, varName) {
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(new RegExp(`var ${varName} = (\\[.*\\]);\\s*$`, 's'));
  if (!match) throw new Error(`Missing ${varName} in ${file}`);
  return JSON.parse(match[1]);
}

export function loadPlusLibrary() {
  if (cache) return cache;
  const education = JSON.parse(fs.readFileSync(path.join(dir, 'library', 'education.json'), 'utf8'));
  const goingDeeper = JSON.parse(fs.readFileSync(path.join(dir, 'library', 'going-deeper.json'), 'utf8'));
  const words = readJsArray(path.join(root, 'app', 'data', 'word-for-the-day.js'), 'WORD_FOR_THE_DAY');
  const jft = readJsArray(path.join(root, 'app', 'data', 'just-for-today.js'), 'JUST_FOR_TODAY');
  cache = {
    nutritionCategories: education.nutritionCategories,
    nutritionCards: education.nutritionCards,
    gutCards: education.gutCards,
    brainCards: education.brainCards,
    coldCards: education.coldCards,
    goingDeeper,
    words,
    jft,
  };
  return cache;
}

export function readingIndex(month, day) {
  let d = day;
  if (month === 2 && d === 29) d = 28;
  let index = d - 1;
  for (let i = 0; i < month - 1; i += 1) index += NON_LEAP_MONTH_DAYS[i];
  return index;
}

export function todayReadingPayload(now = new Date()) {
  const lib = loadPlusLibrary();
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Brisbane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [, month, day] = iso.split('-').map(Number);
  const index = readingIndex(month, day);
  const word = lib.words[index];
  const jft = lib.jft[index];
  return {
    index,
    month,
    day,
    leap: month === 2 && day === 29,
    word: word.word,
    wordReading: word.reading,
    title: jft.title,
    jftReading: jft.reading,
  };
}

export function plusLibraryPayload() {
  const lib = loadPlusLibrary();
  return { ok: true, ...lib };
}
