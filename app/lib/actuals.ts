// Pure scoring of issued podium probabilities vs the actual finishing order, for the
// season calibration record. No % is shown to users — this just accumulates evidence
// toward the M3 reliability check. (M5 R15)
interface PodiumDriver {
  driver: string;
  p_podium: number;
}

export function computeCalibrationRow(
  podium: { drivers: PodiumDriver[] },
  actualFinish: string[],
): { brierContrib: number; top3: number } {
  const top3Actual = new Set(actualFinish.slice(0, 3));
  const drivers = podium.drivers ?? [];
  // pooled Brier over all driver rows: (p - outcome)^2
  const brierContrib =
    drivers.reduce((acc, d) => {
      const outcome = top3Actual.has(d.driver) ? 1 : 0;
      return acc + (d.p_podium - outcome) ** 2;
    }, 0) / Math.max(drivers.length, 1);
  // predicted top-3 = the 3 highest p_podium
  const predTop = [...drivers]
    .sort((a, b) => b.p_podium - a.p_podium)
    .slice(0, 3)
    .map((d) => d.driver);
  const top3 = predTop.filter((d) => top3Actual.has(d)).length / 3;
  return { brierContrib, top3 };
}
