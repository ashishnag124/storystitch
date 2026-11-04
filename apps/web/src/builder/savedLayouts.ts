import { SaveLayoutSchema, SavedLayoutSchema, SavedLayoutsSchema, type Layout, type SaveLayout, type SavedLayout } from "@storystitch/shared";
import { API_URL } from "../config";

/** The user's saved layouts, or "signed-out" when there's no session. Throws when the API can't be reached. */
export async function listSaved(): Promise<SavedLayout[] | "signed-out"> {
  const res = await fetch(`${API_URL}/layouts/mine`, { credentials: "include" });
  if (res.status === 401) return "signed-out";
  if (!res.ok) throw new Error(`GET /layouts/mine: ${res.status}`);
  return SavedLayoutsSchema.parse(await res.json()).layouts;
}

/** Why a save didn't go through, in words for the user. */
export class SaveError extends Error {}

/** Saves a new layout, or replaces the saved one with id `id`. */
export async function saveLayout(name: string, layout: Layout, id?: string): Promise<SavedLayout> {
  // The schema drops the layout's own id and name: the account keeps those.
  const body: SaveLayout = { name, layout: SaveLayoutSchema.shape.layout.parse(layout) };
  const res = await fetch(`${API_URL}/layouts/mine${id ? `/${encodeURIComponent(id)}` : ""}`, {
    method: id ? "PUT" : "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) throw new SaveError("Couldn't reach StoryStitch. Check your connection and try again.");
  if (res.ok) return SavedLayoutSchema.parse(await res.json());
  if (res.status === 401) throw new SaveError("You've been signed out. Sign in again to save.");
  if (res.status === 409) throw new SaveError("Your account already has 20 saved layouts, the most it can hold. Delete one from the Layouts tool to save this one.");
  if (res.status === 400) throw new SaveError("This layout has a problem we couldn't fix. Try moving the photos apart.");
  throw new SaveError("Couldn't save. Please try again.");
}

export async function deleteSaved(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/layouts/mine/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
  if (!res.ok && res.status !== 404) throw new Error(`DELETE /layouts/mine: ${res.status}`);
}
