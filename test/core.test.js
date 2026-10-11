import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTerm,
  selectDailySet,
  selectMore,
  scheduleReview,
  aggregateProgress,
  localDateKey
} from '../src/core.js';

const catalog = [
  {id:'a',term:'die Abhängigkeit',level:'C1',domain:'Software',status:'active'},
  {id:'b',term:'der Quellcode',level:'B2',domain:'Software',status:'active'},
  {id:'c',term:'die Spannung',level:'B2',domain:'Electrical',status:'active'},
  {id:'d',term:'der Wirkungsgrad',level:'C1',domain:'Engineering',status:'active'},
  {id:'e',term:'die Fertigung',level:'B2',domain:'Manufacturing',status:'active'},
  {id:'f',term:'die Verschlüsselung',level:'C1',domain:'Security',status:'active'},
  {id:'g',term:'der Datensatz',level:'B2',domain:'Data',status:'active'},
  {id:'h',term:'die Schnittstelle',level:'B2',domain:'Software',status:'active'},
  {id:'i',term:'die Wärmeleitfähigkeit',level:'C1',domain:'Engineering',status:'active'},
  {id:'j',term:'der Leitungsschutzschalter',level:'C1',domain:'Electrical',status:'active'},
  {id:'k',term:'die Bereitstellung',level:'B2',domain:'Software',status:'active'},
  {id:'z',term:'deprecated',level:'B2',domain:'Software',status:'deprecated'}
];

test('normalizeTerm deduplicates casing, whitespace and Unicode composition', () => {
  assert.equal(normalizeTerm('  DIE   ABHÄNGIGKEIT  '), normalizeTerm('die Abha\u0308ngigkeit'));
});

test('daily selection is deterministic, unique, eligible, and exact sized', () => {
  const first = selectDailySet(catalog, {}, '2026-10-12', 10, {levels:['B2','C1'],domains:[]});
  const second = selectDailySet([...catalog].reverse(), {}, '2026-10-12', 10, {levels:['B2','C1'],domains:[]});
  assert.deepEqual(first, second);
  assert.equal(first.length, 10);
  assert.equal(new Set(first).size, 10);
  assert.ok(!first.includes('z'));
});

test('daily selection prioritizes due cards before unseen cards', () => {
  const cards = {f:{dueAt:'2026-10-11T00:00:00.000Z',status:'review'}};
  const ids = selectDailySet(catalog, cards, '2026-10-12', 3, {levels:['B2','C1'],domains:[]});
  assert.equal(ids[0], 'f');
});

test('more selection never repeats shown ids and exhausts safely', () => {
  const shown = ['a','b','c','d','e','f','g','h','i','j'];
  const more = selectMore(catalog, shown, 10, 'extra-1', {levels:['B2','C1'],domains:[]});
  assert.deepEqual(more, ['k']);
});

test('review scheduling follows documented exact intervals', () => {
  const now = '2026-10-12T10:00:00.000Z';
  const fresh = {status:'new',intervalDays:0,ease:2.5,repetitions:0,lapses:0,correct:0,incorrect:0};
  const again = scheduleReview(fresh, 'again', now);
  const good = scheduleReview(fresh, 'good', now);
  const easy = scheduleReview(fresh, 'easy', now);
  assert.equal(again.status, 'relearning');
  assert.equal(again.dueAt, '2026-10-12T10:10:00.000Z');
  assert.equal(good.intervalDays, 1);
  assert.equal(good.dueAt, '2026-10-13T10:00:00.000Z');
  assert.equal(easy.intervalDays, 4);
});

test('review intervals do not decrease after successful reviews', () => {
  const card = {status:'review',intervalDays:6,ease:2.5,repetitions:3,lapses:0,correct:3,incorrect:0};
  const hard = scheduleReview(card, 'hard', '2026-10-12T10:00:00.000Z');
  const good = scheduleReview(card, 'good', '2026-10-12T10:00:00.000Z');
  assert.ok(hard.intervalDays >= 6);
  assert.ok(good.intervalDays >= hard.intervalDays);
});

test('weekly and monthly progress uses Monday and calendar-month boundaries', () => {
  const activity = {
    '2026-09-30':{studied:7,correct:5,seconds:60},
    '2026-10-05':{studied:3,correct:2,seconds:50},
    '2026-10-11':{studied:10,correct:8,seconds:100}
  };
  const result = aggregateProgress(activity, new Date('2026-10-11T12:00:00'));
  assert.equal(result.week.studied, 13);
  assert.equal(result.month.studied, 13);
  assert.equal(result.month.activeDays, 2);
  assert.equal(result.week.accuracy, 77);
});

test('localDateKey respects the requested timezone', () => {
  const instant = new Date('2026-10-11T23:30:00.000Z');
  assert.equal(localDateKey(instant, 'Europe/Berlin'), '2026-10-12');
  assert.equal(localDateKey(instant, 'America/New_York'), '2026-10-11');
});
