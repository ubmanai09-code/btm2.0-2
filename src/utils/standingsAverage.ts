export function standingsAverage(totalPins: number, gameCount: number): number {
  return totalPins / gameCount;
}

export function standingsScoreRange(scores: number[]): number {
  return scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : 0;
}
