import { describe, expect, it } from "vitest";
import { z } from "zod";
import { layouts } from "./layout";
import { USAGE_BATCH_LIMIT, USAGE_EVENTS, UsageBatchSchema, parseUsageEvent } from "./usage";

/** Why a property breaks the registry's rules, or null if it's allowed. */
function propertyProblem(schema: z.ZodType): string | null {
  const inner = schema instanceof z.ZodCatch ? (schema.unwrap() as z.ZodType) : schema;
  if (inner instanceof z.ZodEnum || inner instanceof z.ZodBoolean) return null;
  if (inner instanceof z.ZodNumber) {
    return Number.isFinite(inner.minValue) && Number.isFinite(inner.maxValue) ? null : "an unbounded number";
  }
  return "not a fixed list, a true/false value or a bounded number";
}

const registryProblems = (registry: Record<string, Record<string, z.ZodType>>) =>
  Object.entries(registry).flatMap(([event, props]) =>
    Object.entries(props).flatMap(([prop, schema]) => {
      const problem = propertyProblem(schema);
      return problem ? [`${event}.${prop}: ${problem}`] : [];
    }),
  );

describe("AC-USAGE-02 the event registry", () => {
  it("AC-USAGE-02 every property is a fixed list, a true/false value or a bounded number", () => {
    expect(registryProblems(USAGE_EVENTS)).toEqual([]);
  });

  it("AC-USAGE-02 the rule refuses free text and unbounded numbers", () => {
    expect(registryProblems({ bad: { fileName: z.string(), size: z.number() } })).toEqual([
      "bad.fileName: not a fixed list, a true/false value or a bounded number",
      "bad.size: an unbounded number",
    ]);
  });

  it("AC-USAGE-02 names events and values in snake_case", () => {
    const snake = /^[a-z]+(_[a-z]+)*$/;
    expect(Object.keys(USAGE_EVENTS).filter((name) => !snake.test(name))).toEqual([]);
  });

  it("AC-USAGE-02 stores a saved layout's id as other, never the id", () => {
    expect(parseUsageEvent({ name: "layout_chosen", props: { layout: "custom-1234" } })?.props).toEqual({ layout: "other" });
    expect(parseUsageEvent({ name: "layout_chosen", props: { layout: "custom" } })?.props).toEqual({ layout: "custom" });
    expect(parseUsageEvent({ name: "layout_chosen", props: { layout: layouts[0]!.id } })?.props).toEqual({ layout: layouts[0]!.id });
  });

  it("AC-USAGE-02 leaves out properties it doesn't list, so free text can't get through", () => {
    expect(parseUsageEvent({ name: "photos_picked", props: { count: 3, fileName: "me.jpg" } })?.props).toEqual({ count: 3 });
  });

  it("AC-USAGE-02 turns a list value it doesn't know into other", () => {
    expect(parseUsageEvent({ name: "screen_viewed", props: { screen: "/reset-password?token=abc" } })?.props).toEqual({ screen: "other" });
  });

  it("AC-USAGE-02 refuses unknown events, bad values and names inherited from Object", () => {
    for (const raw of [
      null,
      "photos_picked",
      { name: "not_an_event" },
      { name: "constructor" },
      { name: "photos_picked" },
      { name: "photos_picked", props: { count: 9 } },
      { name: "photos_picked", props: { count: 1.5 } },
    ]) {
      expect(parseUsageEvent(raw)).toBeNull();
    }
  });

  it("AC-USAGE-02 accepts an event with no properties", () => {
    expect(parseUsageEvent({ name: "visit_started" })).toEqual({ name: "visit_started", props: {} });
  });

  it("AC-USAGE-02 limits a batch's size and checks its app version", () => {
    const batch = { platform: "ios", appVersion: "1.2.0", events: [] };
    expect(UsageBatchSchema.safeParse(batch).success).toBe(true);
    expect(UsageBatchSchema.safeParse({ ...batch, appVersion: "not a version" }).success).toBe(false);
    expect(UsageBatchSchema.safeParse({ ...batch, platform: "desktop" }).success).toBe(false);
    expect(UsageBatchSchema.safeParse({ ...batch, events: Array(USAGE_BATCH_LIMIT + 1).fill({}) }).success).toBe(false);
  });
});
