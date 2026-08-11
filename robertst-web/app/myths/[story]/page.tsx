const myths = {
  prometheus: {
    name: "Prometheus",
    description: "Prometheus stole fire from the gods and gave it to humanity.",
  },
  medusa: {
    name: "Medusa",
    description: "Medusa was one of the most famous figures in Greek mythology.",
  },
  icarus: {
    name: "Icarus",
    description: "Icarus flew too close to the sun.",
  },
};

type MythStory = keyof typeof myths;

export default async function MythPage({
  params,
}: {
  params: Promise<{ story: string }>;
}) {
  const { story } = await params;

  const myth = myths[story as MythStory];

  if (!myth) {
    return <main>Myth not found</main>;
  }

  return (
    <main>
      <h1>{myth.name}</h1>
      <p>{myth.description}</p>
    </main>
  );
}