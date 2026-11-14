export function standingsAverage(scores: number[]): number {
  return scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
}

export function standingsScoreRange(scores: number[]): number {
  return scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : 0;
}
