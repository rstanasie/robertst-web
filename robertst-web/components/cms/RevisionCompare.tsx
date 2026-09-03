"use client";

import { useRouter } from "next/navigation";

import type { RevisionSummary } from "@/lib/cms/revisions";

/**
 * Two selects and a navigation. Comparison state lives in the URL so a
 * particular diff can be linked to, and so the server does the diffing.
 */
export default function RevisionCompare({
  storyId,
  revisions,
  a,
  b,
}: {
  storyId: string;
  revisions: RevisionSummary[];
  a?: string;
  b?: string;
}) {
  const router = useRouter();

  const go = (next: { a?: string; b?: string }) => {
    const params = new URLSearchParams({ a: next.a ?? a ?? "", b: next.b ?? b ?? "" });
    router.push(`/admin/stories/${storyId}/revisions?${params}`);
  };

  const options = revisions.map((revision) => (
    <option key={revision.id} value={revision.id}>
      Revision {revision.number} — {revision.kind.replace("_", " ").toLowerCase()}
    </option>
  ));

  return (
    <div className="cms-row">
      <div className="cms-field">
        <label htmlFor="rev-a">Older</label>
        <select id="rev-a" value={a ?? ""} onChange={(event) => go({ a: event.target.value })}>
          {options}
        </select>
      </div>

      <div className="cms-field">
        <label htmlFor="rev-b">Newer</label>
        <select id="rev-b" value={b ?? ""} onChange={(event) => go({ b: event.target.value })}>
          {options}
        </select>
      </div>
    </div>
  );
}
