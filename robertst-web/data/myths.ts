export const myths = {
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

export type MythStory = keyof typeof myths;