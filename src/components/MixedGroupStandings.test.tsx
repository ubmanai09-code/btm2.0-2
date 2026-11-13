import React from 'react';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MixedGroupStandings, StandingsView } from '../App';
import type { Participant, Score, Team, Tournament } from '../services/api';

const teams: Team[] = [{ id: 1, tournament_id: 1, name: 'Team A' }];
const player = (id: number, team_id: number | null): Participant => ({
  id, tournament_id: 1, team_id, first_name: `Player ${id}`, last_name: '', gender: 'male',
  club: 'Club B', average: 0, email: '', doubles_entrant: 1,
});
const scores: Score[] = [{ id: 1, tournament_id: 1, participant_id: 1, game_number: 1, score: 100 }];

test('only organizers see lineup and incomplete score warnings', () => {
  const data = { teams, participants: [player(1, 1), player(2, 1), player(3, null)], scores, warmups: [] };
  const render = (showWarnings: boolean) => renderToStaticMarkup(
    <MixedGroupStandings event="doubles" data={data} gameCount={2} tx={(text) => text} showWarnings={showWarnings} />,
  );
  const publicHtml = render(false);
  const organizerHtml = render(true);
  for (const warning of ['Incomplete scores', 'Selected players without a team:', 'Rankings are provisional']) {
    assert.ok(!publicHtml.includes(warning));
    assert.ok(organizerHtml.includes(warning));
  }
  assert.ok(publicHtml.includes('Club B'));
  assert.ok(!publicHtml.includes('Team A'));
  assert.ok(publicHtml.includes('100'));

  const invalidData = { ...data, participants: [player(1, 1)] };
  const renderInvalid = (showWarnings: boolean) => renderToStaticMarkup(
    <MixedGroupStandings event="doubles" data={invalidData} gameCount={2} tx={(text) => text} showWarnings={showWarnings} />,
  );
  assert.ok(!renderInvalid(false).includes('Players selected:'));
  assert.ok(renderInvalid(true).includes('Players selected:'));
});

test('doubles and triples provide compact mobile rows and a full desktop table', () => {
  const participants = [player(1, 1), player(2, 1), player(3, 1)].map((p) => ({ ...p, triples_entrant: 1 }));
  const data = { teams, participants, scores, warmups: [] };
  for (const event of ['doubles', 'triples'] as const) {
    const html = renderToStaticMarkup(
      <MixedGroupStandings event={event} data={data} gameCount={2} tx={(text) => text} showWarnings={false} />,
    );
    assert.match(html, /class="sm:hidden divide-y divide-black\/5"/);
    assert.match(html, /<button[^>]*aria-expanded="false"/);
    assert.match(html, /class="hidden sm:block overflow-x-auto"/);
    assert.ok(html.includes('Tap a name for compact details'));
    assert.ok(html.includes('Club B'));
    assert.ok(!html.includes('Team A'));
    assert.match(html, /<th[^>]*>Club<\/th>/);
    assert.doesNotMatch(html, /<th[^>]*>Team<\/th>/);
    assert.ok(html.includes('Avg'));
  }
});

test('group club names come from the roster and missing or differing clubs are not replaced with the team name', () => {
  const participants = [
    { ...player(1, 1), club: 'Club B' },
    { ...player(2, 1), club: 'club b' },
    { ...player(3, 1), club: 'Club C' },
  ];
  const data = { teams, participants, scores, warmups: [] };
  const render = (roster: Participant[]) => renderToStaticMarkup(
    <MixedGroupStandings event="doubles" data={{ ...data, participants: roster }} gameCount={2} tx={(text) => text} showWarnings={false} />,
  );
  assert.ok(render(participants).includes('Club B, Club C'));
  const emptyClubs = render(participants.map((p) => ({ ...p, club: '' })));
  assert.ok(!emptyClubs.includes('Team A'));
  assert.ok(emptyClubs.includes('—'));
});

test('mixed tournament podium offers all five event categories', () => {
  const tournament: Tournament = {
    id: 1, name: 'Mixed', date: '2026-11-15', location: '', format: '', organizer: '', logo: '',
    match_play_type: 'single_elimination', qualified_count: 4, playoff_winners_count: 1,
    type: 'team', games_count: 6, genders_rule: 'Mixed', lanes_count: 10, players_per_lane: 2,
    players_per_team: 5, shifts_count: 1, oil_pattern: '', status: 'draft', enable_singles_division: 1,
    created_at: '',
  };
  const html = renderToStaticMarkup(<StandingsView tournament={tournament} role="admin" />);
  const podium = html.slice(html.indexOf('Winners Podium'), html.indexOf('Top Score Male'));
  for (const label of ['Team Event', "Women&#x27;s Singles", 'Men&#x27;s Singles', 'Doubles', 'Triples']) {
    assert.ok(podium.includes(label), `Missing podium category ${label}`);
  }
});
