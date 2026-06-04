import { glob } from "astro/loaders";
import { defineCollection, z } from "astro:content";

// Blog posts: src/content/blog/*.md
const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    description: z.string(), // one-line summary shown on the writing list
    pubDate: z.coerce.date(), // e.g. 2026-06-15
    tags: z.array(z.string()).default([]), // e.g. ["AI", "Kafka"]
    thumb: z.string().default("pi1"), // gradient class: pi1 | pi2 | pi3 | pi4
    cover: z.string().optional(), // cover gradient on the post page
    minRead: z.number().optional(), // e.g. 8
    draft: z.boolean().default(false), // true = hidden from the list
  }),
});

// Projects: src/content/projects/*.md
const projects = defineCollection({
  loader: glob({ base: "./src/content/projects", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    blurb: z.string(), // short line for the work card
    year: z.string(), // e.g. "2026"
    badge: z.string().default("Project"), // e.g. "AI Project" | "Nordstrom"
    stack: z.array(z.string()).default([]), // e.g. ["Java", "Kafka"]
    cover: z.string().default("pi1"), // gradient class
    demo: z.string().optional(), // live demo URL
    github: z.string().optional(), // repo URL
    order: z.number().default(0), // lower = shown first
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog, projects };
