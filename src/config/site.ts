// ============================================================
//  SITE-WIDE SETTINGS
//  Edit anything here once; it updates everywhere it is used.
// ============================================================

export const site = {
  // --- Identity ---
  name: "Ramakrishna Sayee Meka",
  email: "mramakrishnasayee@gmail.com",

  // --- Feature flags. Flip to true to switch a feature on. ---
  features: {
    series: false, // show the "Series" strip on /writing once you have one
  },

  // Wordmark in the sidebar: a cyan "R" tile fused into the rest.
  wordmark: {
    tile: "R",
    rest: "amakrishna",
  },

  // Default text for the browser tab / SEO when a page doesn't set its own.
  seo: {
    defaultDescription:
      "Ramakrishna Sayee Meka — Senior Software Engineer building distributed systems and AI tooling.",
  },

  // Resume file (lives in /public). Change the filename here if you rename it.
  resumePath: "/Ramakrishna_Sayee_Meka_Resume_web.pdf",

  // The little code comment pinned under the sidebar.
  sidebarJoke: "// light mode is a myth here",

  // --- Navigation (sidebar). Reorder, rename, or remove freely. ---
  nav: [
    { label: "home", href: "/", key: "home" },
    { label: "about", href: "/#about", key: "about" },
    { label: "work", href: "/#work", key: "work" },
    { label: "writing", href: "/writing", key: "writing" },
    { label: "consult", href: "/#consult", key: "consult" },
  ],

  // --- Social links. Set show:false to hide one without deleting it. ---
  socials: [
    { platform: "github", href: "https://github.com/rameka", show: true },
    {
      platform: "linkedin",
      href: "https://linkedin.com/in/ramakrishnasayee",
      show: true,
    },
    { platform: "instagram", href: "#", show: true },
  ],

  // --- Footer (appears on every page). ---
  footer: {
    left: "© 2026 Ramakrishna Sayee Meka",
    right: "built in the open",
  },

  // --- Reused button / link labels. Defined ONCE, used in many places. ---
  ui: {
    send: "Send",
    hireMe: "Hire me \u2192",
    resume: "\u2193 Resume",
    seeWork: "See my work \u2192",
    readArticle: "Read article \u2192",
    allWriting: "\u2190 All writing",
    moreWriting: "More writing \u2192",
    allWork: "\u2190 All work",
    liveDemo: "Live demo \u2192",
    github: "GitHub \u2192",
    writeup: "Writeup \u2192",
    arrow: "\u2192",
  },
};
