// ============================================================
//  WRITING PAGE
//  Posts are Markdown files in src/content/blog/. This file holds
//  the page header text and (later) the Series list.
//
//  NOTE: Tags are now automatic — they're collected from your posts'
//  frontmatter, so you don't list them here. Add a post tagged "Books"
//  and a "Books" filter chip appears on its own.
// ============================================================

export const writing = {
  // Header. Swap the wording freely.
  //   Alternatives you liked:
  //   "The long version." / "Distributed systems, AI, career, and the occasional tangent."
  //   "Working notes."    / "What I'm building, reading, and learning — in the open."
  eyebrow: "Writing",
  heading: "Thinking out loud.",
  lead: "Engineering deep dives, career lessons, books, and whatever else I'm working through.",

  // SERIES — ordered multi-part collections on one topic.
  // The strip only renders when site.features.series is true AND this list
  // has entries. Add one like:
  //   { title: "System Design", slug: "system-design", parts: 28,
  //     blurb: "A ground-up walk through scalable system design." }
  series: [] as {
    title: string;
    slug: string;
    parts: number;
    blurb: string;
  }[],
};
