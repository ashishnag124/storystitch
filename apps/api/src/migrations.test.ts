// The previous API version keeps serving against each new migration, during a deploy and after a rollback. It names
// every column it reads and writes, so a new table or an optional column can't break it. Anything else might.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const folder = new URL("../drizzle/", import.meta.url);

/**
 * The statements in a migration that aren't known to be safe for the previous API. This is a list of what's allowed
 * rather than what's banned, so hand-written SQL no one thought of fails too. `-- reviewed: <what you checked>` on a
 * line above a statement lets that one statement through.
 */
function unsafeStatements(sql: string) {
  const created = new Set<string>();
  return sql.split(";").flatMap((chunk) => {
    const statement = chunk.replace(/--.*$/gm, "").trim();
    const newTable = /^CREATE TABLE "(\w+)"/.exec(statement)?.[1];
    if (newTable) created.add(newTable);
    const changedTable = /^(?:ALTER TABLE|CREATE UNIQUE INDEX "\w+" ON) "(\w+)"/.exec(statement)?.[1];
    const optionalColumn =
      /^ALTER TABLE "\w+" ADD COLUMN "\w+" [^,]*$/.test(statement) &&
      (!statement.includes("NOT NULL") || statement.includes("DEFAULT"));
    const safe =
      !statement ||
      statement === "SELECT 1" ||
      newTable ||
      statement.startsWith("CREATE INDEX") ||
      (changedTable && created.has(changedTable)) ||
      optionalColumn;
    return safe || /^\s*-- reviewed: \S/m.test(chunk) ? [] : [statement];
  });
}

describe("migrations", () => {
  it("AC-API-02 every migration is additive, or its risky statements are marked as reviewed", () => {
    const files = readdirSync(folder).filter((file) => file.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(
        unsafeStatements(readFileSync(new URL(file, folder), "utf8")),
        `${file} may break the previous API version. Add first and remove in a later release, or run the last tagged API against this schema and put "-- reviewed: <what you checked>" above the statement.`,
      ).toEqual([]);
    }
  });

  it.each([
    'DROP TABLE "saved_layout";',
    'ALTER TABLE "user" DROP COLUMN "image";',
    'ALTER TABLE "user" RENAME TO "person";',
    'ALTER TABLE "user" RENAME COLUMN "name" TO "display_name";',
    'ALTER TABLE "user" ALTER COLUMN "name" SET DATA TYPE varchar(80);',
    'ALTER TABLE "user" ALTER COLUMN "image" SET NOT NULL;',
    'ALTER TABLE "user" ADD COLUMN "locale" text NOT NULL;',
    'ALTER TABLE "user" ADD COLUMN "locale" text, DROP COLUMN "image";',
    'ALTER TABLE "user" ADD CONSTRAINT "user_name_unique" UNIQUE("name");',
    'CREATE UNIQUE INDEX "user_name_idx" ON "user" ("name");',
    'DROP INDEX "session_user_id_idx";',
    'DELETE FROM "session";',
  ])("AC-API-02 fails %s", (sql) => {
    expect(unsafeStatements(sql)).toEqual([sql.slice(0, -1)]);
  });

  it.each([
    'ALTER TABLE "user" ADD COLUMN "locale" text;',
    `ALTER TABLE "user" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;`,
    'CREATE TABLE "a" ("id" text PRIMARY KEY NOT NULL);\nCREATE UNIQUE INDEX "a_idx" ON "a" ("id");',
    'CREATE TABLE "a" ("id" text);--> statement-breakpoint\nALTER TABLE "a" ADD CONSTRAINT "a_id_unique" UNIQUE("id");',
  ])("AC-API-02 allows %s", (sql) => {
    expect(unsafeStatements(sql)).toEqual([]);
  });

  it("AC-API-02 a reviewed note covers only the statement below it and must say what was checked", () => {
    const drop = (column: string) => `ALTER TABLE "user" DROP COLUMN "${column}"`;
    expect(unsafeStatements(`-- reviewed: unused since v0.4.0\n${drop("a")};\n${drop("b")};`)).toEqual([drop("b")]);
    expect(unsafeStatements(`-- reviewed:\n${drop("a")};`)).toEqual([drop("a")]);
  });
});
