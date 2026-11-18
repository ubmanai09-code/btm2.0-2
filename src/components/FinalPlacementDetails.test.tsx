import React from 'react';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import FinalPlacementDetails from './FinalPlacementDetails';

test('renders each tied placement and its own scores and team members', () => {
  const html = renderToStaticMarkup(<FinalPlacementDetails t={(_key, fallback) => fallback} details={[
    { name: 'Team A', total: 850, avg: null, isTeam: true, members: [{ name: 'Member A', total: 400, avg: 133.3 }, { name: 'Member B', total: null, avg: null }] },
    { name: 'Player B', total: 600, avg: 200, isTeam: false, members: [] },
  ]} />);
  for (const text of ['Team A', 'Members', 'Member A', 'Member B', 'Player B']) {
    assert.ok(html.includes(text), `Missing ${text}`);
  }
  assert.ok(!html.includes('>850<'));
  assert.ok(!html.includes('>400<'));
  assert.ok(!html.includes('>133.3<'));
  assert.ok(!html.includes('Team total'));
  assert.ok(!html.includes('Total'));
  assert.ok(!html.includes('Standings total'));
  assert.ok(!html.includes('Avg'));
  assert.ok(html.includes('aria-label="Members"'));
});
