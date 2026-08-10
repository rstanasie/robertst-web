"use client";

import { useState } from "react";

export default function Amphora() {
  const [god, setGod] = useState<string | null>(null);
  
    
  function spinAmphora() {
    console.log("Amphora spun!");
  }

  return (
    <section>
      <h2>The Amphora</h2>

      <button onClick={spinAmphora}>
        Spin the Amphora
      </button>
    </section>
  );
}