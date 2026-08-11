"use client";

import { useState } from "react";
import Link from "next/link";

import { myths, MythStory } from "@/data/myths";

const mythStories = Object.keys(myths) as MythStory[];

export default function Amphora() {

  const [story, setStory] = useState<MythStory | null>(null);

  function spinAmphora() {
    const randomIndex = Math.floor(Math.random() * mythStories.length);
    setStory(mythStories[randomIndex]);
  }

  return (
    <section>
      <h2>The Amphora</h2>

      <button onClick={spinAmphora}>
        Spin the Amphora
      </button>

      {story && (
        <div>
          <p>You discovered: {myths[story].name}</p>

          <Link href={`/myths/${story}`}>
            Read the story
          </Link>
        </div>
      )}
    </section>
  );
}