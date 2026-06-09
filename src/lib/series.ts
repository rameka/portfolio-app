// ============================================================
//  SERIES HELPERS
//  Pure logic for the course feature. The DATA lives in
//  src/config/writing.ts; the COUNTS and ORDER are derived here so
//  you never hand-maintain a number or a "next" link.
// ============================================================

export interface Section {
  title: string;
  lessons: string[]; // ordered lesson slugs
}

export interface CourseSystem {
  name: string;
  sections: Section[];
}

export interface Series {
  title: string;
  slug: string;
  blurb: string;
  systems: CourseSystem[];
}

export interface FlatLesson {
  slug: string;
  sysName: string;
  sysIndex: number;
  secTitle: string;
}

// Flatten a series into a single ordered list of lessons. This single
// list is the source of truth for reading order and prev/next, so
// reordering a lesson anywhere in the config just works.
export function flatten(series: Series): FlatLesson[] {
  const out: FlatLesson[] = [];
  series.systems.forEach((sys, sysIndex) => {
    sys.sections.forEach((sec) => {
      sec.lessons.forEach((slug) => {
        out.push({ slug, sysName: sys.name, sysIndex, secTitle: sec.title });
      });
    });
  });
  return out;
}

// Auto-computed counts for the strip and headers. Never typed by hand.
export function counts(series: Series): { systems: number; lessons: number } {
  return { systems: series.systems.length, lessons: flatten(series).length };
}
