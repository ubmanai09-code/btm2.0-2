import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { formatBracketSeedName } from '../App';

test('team seed names retain all words, including names with numbers', () => {
  assert.equal(formatBracketSeedName('B Bowling', true), 'B Bowling');
  assert.equal(formatBracketSeedName('The Bowling Club 2', true), 'The Bowling Club 2');
});

test('player seed names retain existing abbreviation behavior', () => {
  assert.equal(formatBracketSeedName('Jane Smith', false), 'Jane S.');
  assert.equal(formatBracketSeedName('Jane', false), 'Jane');
  assert.equal(formatBracketSeedName('Mixed 28', false), 'Mixed 28');
});
