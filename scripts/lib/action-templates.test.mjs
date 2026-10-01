import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionTemplates } from './action-templates.mjs';

test('browserTabSwitch generates valid tab switch actions', () => {
  const actions = ActionTemplates.browserTabSwitch(2);
  assert.equal(actions.length, 3);
  assert.equal(actions[0].type, 'activate');
  assert.equal(actions[1].type, 'hotkey');
  assert.deepEqual(actions[1].keys, ['cmd', '2']);
});

test('browserNavigate generates navigation sequence', () => {
  const actions = ActionTemplates.browserNavigate('https://example.com');
  assert.equal(actions.length, 6);
  assert.equal(actions[1].type, 'hotkey');
  assert.deepEqual(actions[1].keys, ['cmd', 'l']);
  assert.equal(actions[3].type, 'type');
  assert.equal(actions[3].text, 'https://example.com');
  assert.equal(actions[4].key, 'return');
});

test('spreadsheetEditCell generates click, type, and return', () => {
  const actions = ActionTemplates.spreadsheetEditCell(300, 400, '=SUM(A1:A10)');
  assert.equal(actions.length, 5);
  assert.equal(actions[0].type, 'click');
  assert.equal(actions[0].x, 300);
  assert.equal(actions[0].y, 400);
  assert.equal(actions[2].type, 'type');
  assert.equal(actions[2].text, '=SUM(A1:A10)');
  assert.equal(actions[3].type, 'key');
  assert.equal(actions[3].key, 'return');
});

test('spreadsheetFillFormula generates click and drag', () => {
  const actions = ActionTemplates.spreadsheetFillFormula(100, 200, 100, 500);
  assert.equal(actions.length, 4);
  assert.equal(actions[0].type, 'click');
  assert.equal(actions[2].type, 'drag');
  assert.equal(actions[2].fromX, 100);
  assert.equal(actions[2].toY, 500);
});

test('formFillFields chains multiple inputs and optional submit', () => {
  const fields = [
    { x: 100, y: 150, value: 'john@example.com' },
    { x: 100, y: 200, value: 'secret123' },
  ];
  const submit = { x: 100, y: 250 };
  const actions = ActionTemplates.formFillFields(fields, submit);
  assert.equal(actions.length, 9);
  assert.equal(actions[0].type, 'click');
  assert.equal(actions[2].text, 'john@example.com');
  assert.equal(actions[4].type, 'click');
  assert.equal(actions[6].text, 'secret123');
  assert.equal(actions[8].type, 'click');
  assert.equal(actions[8].x, 100);
  assert.equal(actions[8].y, 250);
});

test('chessMove generates double-click target action', () => {
  const actions = ActionTemplates.chessMove(500, 700, 500, 550);
  assert.equal(actions.length, 4);
  assert.equal(actions[0].type, 'click');
  assert.equal(actions[0].x, 500);
  assert.equal(actions[0].y, 700);
  assert.equal(actions[2].type, 'click');
  assert.equal(actions[2].x, 500);
  assert.equal(actions[2].y, 550);
});
