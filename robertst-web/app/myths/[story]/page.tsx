import { notFound } from "next/navigation";

import { myths, MythStory } from "@/data/myths";

export default async function MythPage({
  params,
}: {
  params: Promise<{ story: string }>;
}) {
  const { story } = await params;

  const myth = myths[story as MythStory];

  if (!myth) {
    notFound();
  }

  return (
    <main>
      <h1>{myth.name}</h1>
      <p>{myth.description}</p>
    </main>
  );
}