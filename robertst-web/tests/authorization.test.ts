import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Server actions are public HTTP endpoints. Rendering the button behind a login
 * protects nothing, so every mutation has to check for itself — and this test
 * exists so that adding one without a check fails here rather than in the wild.
 */
const source = readFileSync(join(process.cwd(), "app/admin/actions.ts"), "utf8");

/** The two that cannot require a session, because they are how you get one. */
const EXEMPT = new Set(["signInAction", "signOutAction"]);

function exportedActions(): { name: string; body: string }[] {
  const found: { name: string; body: string }[] = [];
  const pattern = /export async function (\w+)\s*\(/g;

  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const start = source.indexOf("{", match.index + match[0].length);
    let depth = 0;

    for (let index = start; index < source.length; index += 1) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}") depth -= 1;

      if (depth === 0) {
        found.push({ name: match[1], body: source.slice(start, index + 1) });
        break;
      }
    }
  }

  return found;
}

describe("CMS authorization", () => {
  const actions = exportedActions();

  it("finds the actions to check", () => {
    assert.ok(actions.length >= 8, `only found ${actions.length} exported actions`);
  });

  for (const action of actions) {
    it(`${action.name} establishes who is asking`, () => {
      if (EXEMPT.has(action.name)) {
        assert.ok(
          action.body.includes("prisma.user.findUnique") ||
            action.body.includes("destroySession"),
          `${action.name} is exempt but does not look like an auth endpoint`,
        );
        return;
      }

      assert.ok(
        action.body.includes("await requireUser()"),
        `${action.name} does not call requireUser() — it is reachable by anyone who can POST`,
      );
    });
  }

  it("does not export anything that is not an async function", () => {
    // A "use server" module may only export async functions; a stray const is a
    // build error that only shows up when the page is compiled.
    const badExport = /export (const|let|var|type|interface|class)\s/.exec(
      source.replace(/export type \{[^}]*\}/g, ""),
    );

    assert.equal(badExport, null, `unexpected export: ${badExport?.[0]}`);
  });
});
