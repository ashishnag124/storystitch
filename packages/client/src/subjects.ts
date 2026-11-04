import type { Detection } from "@storystitch/layout-engine";

/** A short description of what was found, e.g. "Found 2 faces and a dog." Null when nothing was. */
export function describeSubjects(all: Detection[][]): string | null {
  const faces = all.flat().filter((d) => d.kind === "face").length;
  const labels = [...new Set(all.flat().flatMap((d) => (d.kind === "object" && d.label ? [d.label] : [])))];
  const parts = [...(faces ? [`${faces} face${faces > 1 ? "s" : ""}`] : []), ...labels.map((l) => `${/^[aeiou]/i.test(l) ? "an" : "a"} ${l}`)];
  if (!parts.length) return null;
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
  return `Found ${list}.`;
}
