/** Whether major.minor.patch `version` comes before `minimum`. A part that's missing counts as 0, as iOS allows "1.0". */
export function isOlderVersion(version: string, minimum: string): boolean {
  const parts = version.split(".").map(Number);
  const minimumParts = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const difference = (parts[i] ?? 0) - (minimumParts[i] ?? 0);
    if (difference !== 0) return difference < 0;
  }
  return false;
}
