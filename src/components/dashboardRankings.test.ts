import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildRankingCategories, type RankingFinalWinner } from './dashboardRankings';

const labels = {
  women: 'Women', men: 'Men', players: 'Players', teams: 'Teams',
  womenTeams: 'Women teams', menTeams: 'Men teams', mixedTeams: 'Mixed teams',
};
const players = [
  { id: 1, name: 'Score leader', gender: 'm', games: 3, total: 700, avg: 233 },
  { id: 2, name: 'Other player', gender: 'f', games: 3, total: 650, avg: 217 },
];
const teams = [
  { id: 1, name: 'Champions', gender: 'm', games: 3, total: 500, avg: 167, members: ['Team member'], member_details: [{ name: 'Team member', total: 250, avg: 125 }] },
];
const winner = (division: string, place: string, display_name: string): RankingFinalWinner => ({ division, place, display_name });

test('score categories remain available until a podium winner is saved', () => {
  const categories = buildRankingCategories(players, teams, labels, true);
  assert.deepEqual(categories.map((category) => category.key), ['t', 'm', 'f']);
  assert.equal(categories[1].rows[0].name, 'Score leader');
  assert.equal(categories[1].isFinalPlacement, undefined);
  assert.deepEqual(buildRankingCategories(players, teams, labels, true, [winner('all', 'first', '[]')]), categories);
});

test('saved winners replace all score categories and preserve missing places and ties', () => {
  const categories = buildRankingCategories(players, teams, labels, false, [
    winner('male', 'third', '["Finalist A","Finalist B"]'),
    winner('male', 'first', 'Champion'),
  ]);
  assert.deepEqual(categories.map((category) => category.key), ['m']);
  assert.deepEqual(categories[0].rows.map((row) => [row.rank, row.name]), [[1, 'Champion'], [3, 'Finalist A, Finalist B']]);
  assert.equal(categories[0].isFinalPlacement, true);
});

test('open podium is shown even when players have gendered score rankings', () => {
  const categories = buildRankingCategories(players, teams, labels, false, [winner('all', 'second', 'Runner-up')]);
  assert.deepEqual(categories.map((category) => category.key), ['o']);
  assert.equal(categories[0].rows[0].rank, 2);
});

test('team and singles winners use podium divisions even without scores', () => {
  const winners = [winner('all', 'first', 'Champions'), winner('female', 'first', 'Singles winner')];
  const categories = buildRankingCategories([], teams, labels, true, winners, true);
  assert.deepEqual(categories.map((category) => category.key), ['t', 'f']);
  assert.deepEqual(categories[0].rows[0].details?.[0], {
    name: 'Champions', total: 500, avg: null, isTeam: true, members: [{ name: 'Team member', total: 250, avg: 125 }],
  });
  assert.equal(categories[1].label, 'Women');
  assert.deepEqual(categories[1].rows[0].details?.[0].members, []);
  const teamCategories = buildRankingCategories([], teams, labels, true, winners, false);
  assert.deepEqual(teamCategories[0].rows[0].details?.[0].members, [{ name: 'Team member', total: 250, avg: 125 }]);
  assert.equal(teamCategories[1].label, 'Women teams');
});

test('individual ties show separate standings totals and averages, including winners outside top scores', () => {
  const categories = buildRankingCategories([], [], labels, false, [
    winner('male', 'first', '["Score leader","Other finalist","Unknown"]'),
  ], false, { players: [players[0], { id: 3, name: 'Other finalist', gender: 'm', games: 2, total: 300, avg: 150 }], teams: [] });
  assert.deepEqual(categories[0].rows[0].details?.map(({ name, total, avg }) => [name, total, avg]), [
    ['Score leader', 700, 233], ['Other finalist', 300, 150], ['Unknown', null, null],
  ]);
});

test('ambiguous names do not borrow another entrant’s scores, but an explicit ID resolves them', () => {
  const duplicates = [players[0], { ...players[0], id: 3, total: 400, avg: 133.3 }];
  const unresolved = buildRankingCategories(duplicates, [], labels, false, [winner('male', 'first', 'Score leader')]);
  assert.equal(unresolved[0].rows[0].details?.[0].total, null);
  const resolved = buildRankingCategories(duplicates, [], labels, false, [
    { ...winner('male', 'first', 'Score leader'), target_kind: 'participant', target_id: 3 },
  ]);
  assert.equal(resolved[0].rows[0].details?.[0].total, 400);
});

test('unscored team members and winners have unavailable scores instead of fabricated zeroes', () => {
  const categories = buildRankingCategories([], [], labels, true, [winner('all', 'third', 'No games')], false, {
    players: [],
    teams: [{ id: 10, name: 'No games', games: 0, total: 0, avg: 0, member_details: [{ name: 'Member', total: null, avg: null }] }],
  });
  assert.deepEqual(categories[0].rows[0].details?.[0], {
    name: 'No games', total: null, avg: null, isTeam: true, members: [{ name: 'Member', total: null, avg: null }],
  });
});
