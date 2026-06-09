import { glob } from "astro/loaders";
import { defineCollection, z } from "astro:content";

// Blog posts: src/content/blog/*.md
const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    description: z.string(), // one-line summary shown on the writing list
    pubDate: z.coerce
      .date()
      .optional()
      .default(() => new Date()), // set a date (e.g. 2026-06-15) or omit it to use today
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

// Lessons: src/content/lessons/*.md
// These power the Series/course pages. They are intentionally a SEPARATE
// collection from blog, so course lessons never show up on the main /writing
// list. A lesson is just Markdown with a tiny bit of frontmatter. The order
// and grouping of lessons live in src/config/writing.ts, not here.
const lessons = defineCollection({
  loader: glob({ base: "./src/content/lessons", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(), // optional one-liner
    kind: z.enum(["concept", "code", "terms", "diagram"]).default("concept"),
    minRead: z.number().optional(),
    draft: z.boolean().default(false), // true = skipped in the course
  }),
});

export const collections = { blog, projects, lessons };
