import { SAVED_LAYOUT_LIMIT, SavedLayoutSchema, SavedLayoutsSchema } from "@storystitch/shared";
import { afterAll, describe, expect, it } from "vitest";
import { testApi, verifiedUser } from "./test-helpers";

// Real Postgres: `docker compose up` locally, a service container in CI.
const api = testApi();
afterAll(() => api.close());

const twoStack = {
  family: "grid",
  cells: [
    { shape: "rect", x: 0, y: 0, w: 1, h: 0.5 },
    { shape: "rect", x: 0, y: 0.5, w: 1, h: 0.5 },
  ],
};
const save = (name = "My layout", layout: unknown = twoStack) => ({ name, layout });

describe("AC-CUSTOM-07 saved layouts", () => {
  it("needs a session for every route", async () => {
    const c = api.client();
    expect((await c.call("/layouts/mine")).status).toBe(401);
    expect((await c.call("/layouts/mine", { body: save() })).status).toBe(401);
    expect((await c.call("/layouts/mine/x", { method: "PUT", body: save() })).status).toBe(401);
    expect((await c.call("/layouts/mine/x", { method: "DELETE" })).status).toBe(401);
  });

  it("saves, lists newest first, renames and edits, and deletes a user's own layouts", async () => {
    const { c } = await verifiedUser(api);
    const first = SavedLayoutSchema.parse(await (await c.call("/layouts/mine", { body: save("First") })).json());
    expect(first.id).toMatch(/^custom-/);
    expect(first.layout).toMatchObject({ id: first.id, name: "First", family: "grid" });
    const second = SavedLayoutSchema.parse(await (await c.call("/layouts/mine", { body: save("Second") })).json());

    let list = SavedLayoutsSchema.parse(await (await c.call("/layouts/mine")).json());
    expect(list.layouts.map((l) => l.name)).toEqual(["Second", "First"]);
    expect(list.limit).toBe(SAVED_LAYOUT_LIMIT);

    const taller = { ...twoStack, cells: [{ ...twoStack.cells[0], h: 0.6 }, { ...twoStack.cells[1], y: 0.6, h: 0.4 }] };
    const res = await c.call(`/layouts/mine/${first.id}`, { method: "PUT", body: save("Renamed", taller) });
    expect(res.status).toBe(200);
    expect(SavedLayoutSchema.parse(await res.json()).layout.cells[0]).toMatchObject({ h: 0.6 });

    expect((await c.call(`/layouts/mine/${second.id}`, { method: "DELETE" })).status).toBe(204);
    list = SavedLayoutsSchema.parse(await (await c.call("/layouts/mine")).json());
    expect(list.layouts.map((l) => l.name)).toEqual(["Renamed"]);
  });

  it("refuses layouts that aren't valid, like the built-in ones", async () => {
    const { c } = await verifiedUser(api);
    const outside = { family: "grid", cells: [{ shape: "rect", x: 0.5, y: 0, w: 0.6, h: 1 }] };
    const res = await c.call("/layouts/mine", { body: save("Bad", outside) });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "INVALID_LAYOUT", problems: [expect.stringMatching(/leaves the canvas/)] });
    expect((await c.call("/layouts/mine", { body: { name: "", layout: twoStack } })).status).toBe(400);
    expect((await c.call("/layouts/mine", { body: { name: "x", layout: { cells: [] } } })).status).toBe(400);
  });

  it("never shows or changes another user's layouts", async () => {
    const alice = await verifiedUser(api);
    const bob = await verifiedUser(api);
    const mine = SavedLayoutSchema.parse(await (await alice.c.call("/layouts/mine", { body: save("Alice's") })).json());
    expect(SavedLayoutsSchema.parse(await (await bob.c.call("/layouts/mine")).json()).layouts).toEqual([]);
    expect((await bob.c.call(`/layouts/mine/${mine.id}`, { method: "PUT", body: save("Bob's") })).status).toBe(404);
    expect((await bob.c.call(`/layouts/mine/${mine.id}`, { method: "DELETE" })).status).toBe(404);
    expect(SavedLayoutsSchema.parse(await (await alice.c.call("/layouts/mine")).json()).layouts[0]!.name).toBe("Alice's");
  });

  it(`holds up to ${SAVED_LAYOUT_LIMIT} layouts and says so when full`, async () => {
    const { c } = await verifiedUser(api);
    for (let i = 0; i < SAVED_LAYOUT_LIMIT; i++) expect((await c.call("/layouts/mine", { body: save(`L${i}`) })).status).toBe(201);
    const full = await c.call("/layouts/mine", { body: save("One too many") });
    expect(full.status).toBe(409);
    expect(await full.json()).toEqual({ error: "LIMIT_REACHED", limit: SAVED_LAYOUT_LIMIT });
  });

  it("only accepts changes sent from StoryStitch's own web origins", async () => {
    const { c } = await verifiedUser(api);
    const res = await c.call("/layouts/mine", { body: save(), headers: { Origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });

  it("AC-AUTH-08 deletes a user's layouts with their account", async () => {
    const { c, password } = await verifiedUser(api);
    await c.call("/layouts/mine", { body: save() });
    const { rows: before } = await api.pool.query("select count(*)::int as n from saved_layout");
    expect((await c.call("/api/auth/delete-user", { body: { password } })).status).toBe(200);
    const { rows: after } = await api.pool.query("select count(*)::int as n from saved_layout");
    expect(after[0].n).toBe(before[0].n - 1);
  });
});
