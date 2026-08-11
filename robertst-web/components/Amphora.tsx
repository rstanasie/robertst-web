"use client";

import { useState } from "react";
import Link from "next/link";

const myths = [
  { name: "Prometheus", story: "prometheus" },
  { name: "Medusa", story: "medusa" },
  { name: "Icarus", story: "icarus" },
];

export default function Amphora() {

  const [god, setGod] = useState<(typeof myths)[number] | null>(null);
  
  function spinAmphora() {
    const randomIndex = Math.floor(Math.random() * myths.length);
    setGod(myths[randomIndex]);
  }

  return (
    <section>
      <h2>The Amphora</h2>

      <button onClick={spinAmphora}>
        Spin the Amphora
      </button>

      {god && (
        <div>
          <p>You discovered: {god.name}</p>

          <Link href={`/myths/${god.story}`}>
            Read the story
          </Link>
        </div>
      )}
    </section>
  );
}