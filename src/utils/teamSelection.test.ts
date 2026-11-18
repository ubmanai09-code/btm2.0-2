import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildTournamentEngine } from './tournamentEngine';
import { buildTeamSelectionPairings, getTeamSelectionDraftError } from './teamSelection';

test('requires a valid, complete 8-team selection draft', () => {
  assert.match(getTeamSelectionDraftError(16, {}) || '', /exactly 8/);
  assert.match(getTeamSelectionDraftError(8, {}) || '', /Seed 1/);
  assert.match(getTeamSelectionDraftError(8, { 1: 8, 2: 8 }) || '', /Seed 2/);
  assert.equal(getTeamSelectionDraftError(8, { 1: 8, 2: 6, 3: 5, 4: 7 }), null);
});

test('creates first-round pairings in seed-pick order', () => {
  assert.deepEqual(buildTeamSelectionPairings(8, { 1: 8, 2: 6, 3: 5, 4: 7 }), [
    { slot1: 'seed:1', slot2: 'seed:8' },
    { slot1: 'seed:2', slot2: 'seed:6' },
    { slot1: 'seed:3', slot2: 'seed:5' },
    { slot1: 'seed:4', slot2: 'seed:7' },
  ]);
});

test('exposes only the next unpaired seed and its remaining opponents', () => {
  assert.deepEqual(buildTeamSelectionPairings(8, {}), [
    { slot1: 'seed:1', slot2: '' },
    { slot1: '', slot2: '' },
    { slot1: '', slot2: '' },
    { slot1: '', slot2: '' },
  ]);
  assert.deepEqual(buildTeamSelectionPairings(8, { 1: 8 }), [
    { slot1: 'seed:1', slot2: 'seed:8' },
    { slot1: 'seed:2', slot2: '' },
    { slot1: '', slot2: '' },
    { slot1: '', slot2: '' },
  ]);
});

test('the next highest unpaired seed becomes the next picker', () => {
  assert.deepEqual(buildTeamSelectionPairings(8, { 1: 2, 2: 8, 3: 7, 4: 6 }), [
    { slot1: 'seed:1', slot2: 'seed:2' },
    { slot1: 'seed:3', slot2: 'seed:8' },
    { slot1: 'seed:4', slot2: 'seed:7' },
    { slot1: 'seed:5', slot2: 'seed:6' },
  ]);
});

test('the bracket engine places selected opponents in pick order', () => {
  const pairings = buildTeamSelectionPairings(8, { 1: 8, 2: 6, 3: 5, 4: 7 });
  const result = buildTournamentEngine({
    participants: Array.from({ length: 8 }, (_, index) => ({
      id: `team-${index + 1}`,
      name: `Team ${index + 1}`,
      seed: index + 1,
    })),
    rounds: [{
      id: 'round-1',
      name: 'Round 1',
      matchType: 'head-to-head',
      sourceOutcome: 'winner',
      playersPerMatch: 2,
      scoringType: 'pins',
      advancementCount: 1,
      manualMatchCount: null,
      customPairings: pairings,
      reseed: false,
    }],
  });
  assert.deepEqual(result.matches.map((match) => match.slots.map((slot) => slot.sourceLabel)), [
    ['1. Team 1', '8. Team 8'],
    ['2. Team 2', '6. Team 6'],
    ['3. Team 3', '5. Team 5'],
    ['4. Team 4', '7. Team 7'],
  ]);
});

test('the four first-round winners advance through semifinals and a final', () => {
  const result = buildTournamentEngine({
    participants: Array.from({ length: 8 }, (_, index) => ({
      id: `team-${index + 1}`,
      name: `Team ${index + 1}`,
      seed: index + 1,
    })),
    rounds: [
      {
        id: 'selection',
        name: 'Selection Round',
        matchType: 'head-to-head',
        sourceOutcome: 'winner',
        playersPerMatch: 2,
        scoringType: 'pins',
        advancementCount: 1,
        manualMatchCount: 4,
        customPairings: buildTeamSelectionPairings(8, { 1: 2, 2: 8, 3: 7, 4: 6 }),
        reseed: false,
      },
      {
        id: 'semifinals',
        name: 'Semifinals',
        matchType: 'head-to-head',
        sourceOutcome: 'winner',
        playersPerMatch: 2,
        scoringType: 'pins',
        advancementCount: 1,
        manualMatchCount: 2,
        reseed: false,
      },
      {
        id: 'final',
        name: 'Final',
        matchType: 'head-to-head',
        sourceOutcome: 'winner',
        playersPerMatch: 2,
        scoringType: 'pins',
        advancementCount: 1,
        manualMatchCount: 1,
        reseed: false,
      },
    ],
  });

  assert.deepEqual(
    ['selection', 'semifinals', 'final'].map((roundId) => result.matches.filter((match) => match.roundId === roundId).length),
    [4, 2, 1],
  );
  assert.equal(result.matches.filter((match) => match.roundId === 'semifinals')
    .flatMap((match) => match.slots).filter((slot) => slot.sourceType === 'advance').length, 4);
});
