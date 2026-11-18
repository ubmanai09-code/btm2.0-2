export type TeamSelectionEntry = { seed: number; name: string };
export type TeamSelectionDraft = Record<number, number>;
export type TeamSelectionPairing = { slot1: string; slot2: string | null };

export const isValidTeamSelectionSeedCount = (seedCount: number) =>
  seedCount === 8;

export function getTeamSelectionPickOptions(seedCount: number, draft: TeamSelectionDraft) {
  if (!isValidTeamSelectionSeedCount(seedCount)) return [];

  const unpairedSeeds = Array.from({ length: seedCount }, (_, index) => index + 1);
  let picksInOrder = true;
  return Array.from({ length: seedCount / 2 }, (_, index) => {
    const pickNumber = index + 1;
    const captainSeed = unpairedSeeds[0];
    const opponentSeeds = unpairedSeeds.slice(1);
    const selectedOpponentSeed = Number(draft[pickNumber]);
    const selectedOpponentIsAvailable = opponentSeeds.includes(selectedOpponentSeed);
    const pick = {
      pickNumber,
      captainSeed,
      opponentSeeds,
      selectedOpponentSeed: selectedOpponentIsAvailable ? selectedOpponentSeed : 0,
      enabled: picksInOrder,
    };

    if (picksInOrder && selectedOpponentIsAvailable) {
      unpairedSeeds.splice(unpairedSeeds.indexOf(selectedOpponentSeed), 1);
      unpairedSeeds.shift();
    } else {
      picksInOrder = false;
    }

    return pick;
  });
}

export function getTeamSelectionDraftError(seedCount: number, draft: TeamSelectionDraft): string | null {
  if (!isValidTeamSelectionSeedCount(seedCount)) {
    return 'Team Match Play requires exactly 8 qualified teams.';
  }

  const incompletePick = getTeamSelectionPickOptions(seedCount, draft)
    .find((pick) => !pick.selectedOpponentSeed);
  return incompletePick
    ? `Seed ${incompletePick.captainSeed} must select an available opponent before the next unpaired seed picks.`
    : null;
}

export function buildTeamSelectionPairings(seedCount: number, draft: TeamSelectionDraft): TeamSelectionPairing[] {
  if (!isValidTeamSelectionSeedCount(seedCount)) {
    return Array.from({ length: 4 }, (_, index) => ({
      slot1: index < seedCount ? `seed:${index + 1}` : '',
      slot2: '',
    }));
  }
  const picks = getTeamSelectionPickOptions(seedCount, draft);
  return picks.map((pick) => ({
    slot1: pick.enabled ? `seed:${pick.captainSeed}` : '',
    slot2: pick.selectedOpponentSeed > 0 ? `seed:${pick.selectedOpponentSeed}` : '',
  }));
}
