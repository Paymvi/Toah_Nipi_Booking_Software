import test from 'node:test';
import assert from 'node:assert/strict';
import { tutorials, safeActions } from '../src/tutorials/registry.js';
import { initialSession, sessionReducer, expectedMatches, practiceValid, readCompleted, saveCompleted, STORAGE_KEY, dialoguePosition } from '../src/tutorials/model.js';

const running = () => sessionReducer(initialSession, { type: 'start', id: 'calendar' });
const advance = (session, extra = {}) => sessionReducer(session, { type: 'advance', allowed: true, total: 3, index: session.index, revision: session.revision, ...extra });

test('V1 has four complete, independent definitions and only allow-listed demo operations', () => {
  assert.equal(tutorials.length, 4);
  assert.equal(new Set(tutorials.map((t) => t.id)).size, 4);
  const allStepIds = [];
  for (const tutorial of tutorials) {
    assert.ok(tutorial.title && tutorial.category && tutorial.description && tutorial.difficulty);
    assert.ok(tutorial.steps.length >= 5);
    for (const step of tutorial.steps) {
      allStepIds.push(`${tutorial.id}:${step.id}`);
      assert.ok(step.target && step.text);
      if (step.kind === 'state') assert.ok(step.expected);
      if (step.demoAction) assert.ok(Object.hasOwn(safeActions, step.demoAction));
      if (step.kind === 'practice') assert.equal(step.target, 'practice');
    }
  }
  assert.equal(new Set(allStepIds).size, allStepIds.length);
  assert.deepEqual(Object.values(safeActions).filter((a) => a.view).map((a) => a.view).sort(), ['Calendar View', 'Form', 'Reports', 'Spreadsheet View']);
  assert.ok(Object.values(safeActions).filter((a) => a.target).every((a) => a.target.startsWith('calendar-')));
  assert.ok(tutorials.find((t) => t.id === 'view-overview').steps.filter((s) => s.expected?.value === 'Booking Detail').every((s) => s.demoPractice === 'profile'));
});

test('a click or unrelated state is not successful progression', () => {
  const expected = { target: 'staff-view', attribute: 'data-tutorial-view', value: 'Booking Detail' };
  assert.equal(expectedMatches(expected, () => 'Spreadsheet View'), false);
  assert.equal(expectedMatches(expected, () => null), false);
  assert.equal(expectedMatches(expected, () => 'Booking Detail'), true);
  const session = running();
  assert.equal(advance(session, { allowed: false }), session);
  assert.equal(sessionReducer(session, { type: 'click' }), session);
});

test('period change requires a known baseline and a different rendered period', () => {
  const expected = { target: 'calendar', attribute: 'data-tutorial-period', changed: true };
  assert.equal(expectedMatches(expected, () => '2026-10', undefined), false);
  assert.equal(expectedMatches(expected, () => '2026-10', '2026-10'), false);
  assert.equal(expectedMatches(expected, () => null, '2026-10'), false);
  assert.equal(expectedMatches(expected, () => '2026-11', '2026-10'), true);
});

test('pause prevents timer/state progression; stale duplicate timers cannot advance another step', () => {
  const session = running();
  const paused = sessionReducer(session, { type: 'pause' });
  assert.equal(advance(paused), paused);
  const resumed = sessionReducer(paused, { type: 'pause' });
  const next = advance(resumed);
  assert.equal(next.index, 1);
  assert.equal(advance(next, { index: session.index, revision: session.revision }), next);
  assert.equal(advance(next, { revision: session.revision }), next);
});

test('previous/restart/exit and skipped completion have explicit semantics', () => {
  let session = advance(running(), { skip: true });
  assert.deepEqual(session.skipped, [0]);
  session = advance(session);
  session = advance(session);
  assert.equal(session.status, 'finished');
  assert.equal(session.skipped.length, 1);
  assert.equal(advance(session), session);
  const previous = sessionReducer(session, { type: 'previous' });
  assert.equal(previous.status, 'running');
  assert.equal(previous.index, 1);
  const restarted = sessionReducer(session, { type: 'restart' });
  assert.equal(restarted.index, 0);
  assert.equal(restarted.tutorialId, 'calendar');
  assert.deepEqual(restarted.skipped, []);
  assert.equal(sessionReducer(restarted, { type: 'exit' }).tutorialId, null);
});

test('practice validates meaningful values without a service or real form', () => {
  assert.equal(practiceValid('group', { group: ' ', contact: 'Alex', type: 'sample' }), false);
  assert.equal(practiceValid('group', { group: 'Sample', contact: 'Alex', type: 'sample' }), true);
  for (const guests of ['0', '-1', '2.5', 'NaN', '']) assert.equal(practiceValid('dates', { arrival: '2026-11-10', departure: '2026-11-12', guests }), false);
  assert.equal(practiceValid('dates', { arrival: '2026-11-12', departure: '2026-11-10', guests: '24' }), false);
  assert.equal(practiceValid('dates', { arrival: '2026-11-10', departure: '2026-11-12', guests: '24' }), true);
});

test('completion persistence tolerates corruption/blocked storage and retains IDs only', () => {
  const ids = tutorials.map((t) => t.id);
  for (const raw of ['bad json', '{}', 'null', '42']) assert.deepEqual(readCompleted({ getItem: () => raw }, ids), []);
  assert.deepEqual(readCompleted({ getItem: () => JSON.stringify([ids[0], ids[0], { guest: 'private' }, 'unknown']) }, ids), [ids[0]]);
  assert.deepEqual(readCompleted({ getItem() { throw new Error('blocked'); } }, ids), []);
  assert.doesNotThrow(() => saveCompleted({ setItem() { throw new Error('full'); } }, ids));
  saveCompleted({ setItem(key, value) { assert.equal(key, STORAGE_KEY); assert.deepEqual(JSON.parse(value), ids); } }, ids);
});

test('dialogue is clamped to desktop and small viewports', () => {
  for (const width of [320, 390, 768, 1440]) {
    const position = dialoguePosition({ left: width - 100, right: width - 20, top: 550, bottom: 590 }, width, 650, 320);
    assert.ok(position.left >= 12);
    assert.ok(position.left + position.width <= width - 12);
    assert.ok(position.top >= 12 && position.top + 320 <= 650 - 12);
  }
});
