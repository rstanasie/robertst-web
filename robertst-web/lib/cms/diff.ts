/**
 * A small line diff, used to compare two revisions.
 *
 * Pure, dependency-free and about a hundred lines, because that is all this
 * needs: two versions of one article, compared once, for a human to read. A
 * diff library would be a larger surface than the feature.
 *
 * Longest-common-subsequence over lines, then a word-level pass inside blocks
 * that were replaced, so a reworded sentence highlights the words rather than
 * the paragraph.
 */

export type DiffOp = "equal" | "insert" | "delete";

export type DiffLine = {
  op: DiffOp;
  text: string;
  /** Present on replaced lines: the same text split into changed word runs. */
  words?: { op: DiffOp; text: string }[];
};

function lcsTable(a: readonly string[], b: readonly string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  return table;
}

function diffTokens(a: readonly string[], b: readonly string[]): { op: DiffOp; text: string }[] {
  const table = lcsTable(a, b);
  const out: { op: DiffOp; text: string }[] = [];

  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: "equal", text: a[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ op: "delete", text: a[i] });
      i += 1;
    } else {
      out.push({ op: "insert", text: b[j] });
      j += 1;
    }
  }

  while (i < a.length) {
    out.push({ op: "delete", text: a[i] });
    i += 1;
  }

  while (j < b.length) {
    out.push({ op: "insert", text: b[j] });
    j += 1;
  }

  return out;
}

const WORDS = /(\s+)/;

function wordDiff(before: string, after: string) {
  const split = (line: string) => line.split(WORDS).filter((piece) => piece !== "");
  return diffTokens(split(before), split(after));
}

/**
 * A rewritten line is a delete immediately followed by an insert. Pairing them
 * up is what turns "this whole paragraph changed" into "these three words did".
 */
function refine(lines: DiffLine[]): DiffLine[] {
  const out: DiffLine[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    const next = lines[index + 1];

    if (
      current.op === "delete" &&
      next?.op === "insert" &&
      current.text.trim() !== "" &&
      next.text.trim() !== ""
    ) {
      const words = wordDiff(current.text, next.text);
      out.push({ ...current, words: words.filter((word) => word.op !== "insert") });
      out.push({ ...next, words: words.filter((word) => word.op !== "delete") });
      index += 1;
      continue;
    }

    out.push(current);
  }

  return out;
}

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  return refine(diffTokens(a, b).map(({ op, text }) => ({ op, text })));
}

export type DiffSummary = { added: number; removed: number; unchanged: number };

export function summarise(lines: readonly DiffLine[]): DiffSummary {
  return lines.reduce<DiffSummary>(
    (total, line) => {
      if (line.op === "insert") total.added += 1;
      else if (line.op === "delete") total.removed += 1;
      else total.unchanged += 1;
      return total;
    },
    { added: 0, removed: 0, unchanged: 0 },
  );
}
