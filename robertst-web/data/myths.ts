export const myths = {
  prometheus: {
    name: "Prometheus",
    description: "Prometheus stole fire from the gods and gave it to humanity.",
    angle: 0,
  },
  medusa: {
    name: "Medusa",
    description: "Medusa was one of the most famous figures in Greek mythology.",
    angle: 120,
  },
  icarus: {
    name: "Icarus",
    description: "Icarus flew too close to the sun.",
    angle: 240,
  },
};

export type MythStory = keyof typeof myths;
