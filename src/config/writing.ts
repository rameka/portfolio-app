// ============================================================
//  WRITING PAGE
//  Posts are Markdown files in src/content/blog/. This file holds
//  the page header text and the Series list.
//
//  NOTE: Tags are now automatic — they're collected from your posts'
//  frontmatter, so you don't list them here. Add a post tagged "Books"
//  and a "Books" filter chip appears on its own.
// ============================================================

import type { Series } from "../lib/series";

export const writing = {
  // Header. Swap the wording freely.
  eyebrow: "Writing",
  heading: "Thinking out loud.",
  lead: "Engineering deep dives, career lessons, books, and whatever else I'm working through.",

  // SERIES — multi-part collections on one topic, shown as a course.
  //
  // Shape:
  //   title  — display name
  //   slug   — URL piece, lives at /writing/series/<slug>
  //   blurb  — one line under the title
  //   systems[] — the big buckets inside the series
  //     name      — system name (e.g. "Rate Limiter")
  //     sections[]
  //       title    — a sub-group label (e.g. "Algorithms")
  //       lessons[] — ordered list of lesson SLUGS (filenames in
  //                   src/content/lessons/, without the .md)
  //
  // To add a lesson: write src/content/lessons/<slug>.md, then add
  //   "<slug>" to a section's lessons array. To reorder: move the line.
  // Every count ("3 systems · 10 lessons") is computed from these arrays.
  // You never type a number.
  //
  // The strip on /writing only renders when site.features.series is true
  // AND this list is non-empty. The course pages themselves build either
  // way, so you can preview them by URL while the flag is off.
  //
  // The series below is a THROWAWAY seed so you can see the structure.
  // Delete it (set series: []) or replace it with the real thing later.
  series: [
    {
      title: "System Design",
      slug: "system-design",
      blurb:
        "Building real systems from first principles. A scratch series for trying out the format.",
      systems: [
        {
          name: "Concepts",
          sections: [
            {
              title: "Fundamentals",
              lessons: ["sd-latency", "sd-caching", "sd-littles-law"],
            },
          ],
        },
        {
          name: "Rate Limiter",
          sections: [
            { title: "Foundations", lessons: ["rl-terminology"] },
            {
              title: "Algorithms",
              lessons: ["rl-token-bucket", "rl-token-bucket-code"],
            },
            { title: "System design", lessons: ["rl-request-flow"] },
          ],
        },
      ],
    },
  ] as Series[],
};
