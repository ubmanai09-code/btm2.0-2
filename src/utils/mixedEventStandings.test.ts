import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Participant, Score, Team } from '../services/api';
import { calculateMixedGroupStandings, rankMixedSingles } from './mixedEventStandings';
import { parseParticipantCsv } from './participantCsv';

const teams: Team[] = [
  { id: 1, tournament_id: 1, name: 'A' },
  { id: 2, tournament_id: 1, name: 'B' },
];
const player = (id: number, team_id: number | null, doubles: number, triples: number): Participant => ({
  id, tournament_id: 1, team_id, first_name: `Player${id}`, last_name: '', gender: 'male',
  club: '', average: 0, email: '', doubles_entrant: doubles, triples_entrant: triples,
});
const score = (participant_id: number, game_number: number, pins: number): Score => ({
  id: participant_id * 10 + game_number, tournament_id: 1, participant_id, game_number, score: pins,
});

test('calculates independent overlapping doubles and triples from official games', () => {
  const players = [player(1, 1, 1, 1), player(2, 1, 1, 0), player(3, 1, 0, 1), player(4, 1, 0, 1)];
  const scores = [score(1, 1, 100), score(1, 2, 110), score(1, 3, 300), score(2, 1, 120), score(2, 2, 130), score(3, 1, 140), score(3, 2, 150), score(4, 1, 160), score(4, 2, 170)];
  const doubles = calculateMixedGroupStandings('doubles', teams, players, scores, 2, new Set());
  const triples = calculateMixedGroupStandings('triples', teams, players, scores, 2, new Set());
  assert.equal(doubles.rows[0].total, 460);
  assert.equal(doubles.rows[0].average, 230);
  assert.deepEqual(doubles.rows[0].games.map((g) => g.total), [220, 240]);
  assert.equal(triples.rows[0].total, 830);
  assert.equal(triples.rows[0].average, 415);
  assert.deepEqual(triples.rows[0].members.map((p) => p.id), [1, 3, 4]);
  assert.equal(doubles.rows[0].complete, true);
  assert.equal(doubles.rows[1].rank, null);
});

test('flags missing scores, invalid lineups and unassigned entrants, and preserves tied ranks', () => {
  const players = [player(1, 1, 1, 0), player(2, 1, 1, 0), player(3, 2, 1, 0), player(4, 2, 1, 0), player(5, null, 1, 0)];
  const scores = [score(1, 1, 0), score(2, 1, 100), score(3, 1, 50), score(4, 1, 50)];
  const result = calculateMixedGroupStandings('doubles', teams, players, scores, 2, new Set());
  assert.deepEqual(result.rows.map((row) => row.rank), [1, 1]);
  assert.equal(result.rows[0].complete, false);
  assert.equal(result.rows[0].games[0].count, 2);
  assert.equal(result.rows[0].average, 100);
  assert.deepEqual(result.unassigned.map((p) => p.id), [5]);
  const excluded = calculateMixedGroupStandings('doubles', teams, players, scores, 2, new Set([2]));
  assert.equal(excluded.rows.find((row) => row.team.id === 1)?.rank, null);
  assert.equal(excluded.rows.find((row) => row.team.id === 1)?.valid, false);
  assert.equal(excluded.rows.find((row) => row.team.id === 1)?.average, null);
  const noScores = calculateMixedGroupStandings('doubles', teams, players, [], 2, new Set());
  assert.deepEqual(noScores.rows.map((row) => row.rank), [null, null]);
  assert.deepEqual(noScores.rows.map((row) => row.average), [null, null]);
});

test('averages only completed team games, including zero scores', () => {
  const players = [player(1, 1, 1, 0), player(2, 1, 1, 0)];
  const scores = [score(1, 1, 0), score(2, 1, 100), score(1, 2, 200)];
  const row = calculateMixedGroupStandings('doubles', teams, players, scores, 2, new Set()).rows[0];
  assert.equal(row.total, 300);
  assert.equal(row.average, 100);
  assert.equal(row.complete, false);
});

test('CSV event flags round-trip and missing columns do not overwrite selections', () => {
  const [withFlags] = parseParticipantCsv('First Name,Last Name,Singles Entrant,Doubles Entrant,Triples Entrant\nA,B,1,0,1');
  assert.equal(withFlags.singles_entrant, 1);
  assert.equal(withFlags.doubles_entrant, 0);
  assert.equal(withFlags.triples_entrant, 1);
  const [withoutFlags] = parseParticipantCsv('First Name,Last Name\nA,B');
  assert.equal('doubles_entrant' in withoutFlags, false);
  assert.throws(() => parseParticipantCsv('First Name,Doubles Entrant\nA,maybe'), /Invalid doubles_entrant/);
});

test('singles ranks tied totals equally and excludes players without recorded games', () => {
  const rows = [
    { participant_id: 1, grand_total: 200 },
    { participant_id: 2, grand_total: 200 },
    { participant_id: 3, grand_total: 0 },
    { participant_id: 4, grand_total: 0 },
  ];
  assert.deepEqual([...rankMixedSingles(rows, new Map([['1-1', 200], ['2-1', 200], ['4-1', 0]]), 2)], [[1, 1], [2, 1], [4, 3]]);
});
