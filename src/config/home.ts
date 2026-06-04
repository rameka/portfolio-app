// ============================================================
//  HOME PAGE CONTENT
//  All the text on the home page lives here. Edit values,
//  reorder list items, add/remove cards — no markup needed.
// ============================================================

export const home = {
  // --- Hero ---
  hero: {
    eyebrow: "Distributed Systems &nbsp;/&nbsp; AI Engineering",
    name: "Hi, I'm Ram.",
    sub: "I build systems that scale.",
    lead: "I'm a senior software engineer who builds distributed systems that stay up under load, most recently leading a real time inventory platform at Nordstrom. These days I'm going deep on AI engineering, building LLM powered tools, retrieval systems, and agents in the open.",
    ctaHref: "#consult", // where the "Hire me" button goes
    workHref: "#work", // where "See my work" goes
  },

  // --- About ---
  about: {
    label: "", // kicker hidden (was "About") — the heading is enough
    heading: "A bit about me",
    paragraphs: [
      "I'm a senior software engineer based in Seattle. For the last several years I led the engineering behind a real time inventory platform at Nordstrom, the kind of system where a few seconds of staleness shows up in stores and online. That work taught me to care about correctness, observability, and systems that hold up when traffic spikes.",
      "Lately I'm pointing that same discipline at AI engineering, building LLM powered tools, retrieval systems, and agents, and treating them like real software with evals and guardrails. Away from the keyboard I collect watches, play chess and poker, and have written a few books.",
    ],
    // The `const ram = {...}` code card. Edit these values freely.
    ram: {
      role: "Senior Software Engineer",
      builds: "systems that scale",
      focus: ["Distributed Systems", "AI Engineering", "Full-Stack"],
      caresAbout: ["system design", "correctness", "scale", "shipping"],
      currently: "building LLM tools, in the open",
      openToWork: true,
    },
  },

  // --- Proficiencies (three boxes). Icons are fixed by position. ---
  proficiencies: {
    label: "What I Do",
    heading: "Proficiencies",
    items: [
      {
        title: "Distributed Systems",
        desc: "Real time platforms, event streaming, and data systems built to stay up under heavy load.",
        tags: "Kafka · Redis · PostgreSQL · Kubernetes",
      },
      {
        title: "AI Engineering",
        desc: "LLM powered products: RAG, tool using agents, and evals, built on foundation models.",
        tags: "RAG · Agents · pgvector · Evals",
      },
      {
        title: "Full-Stack & App Dev",
        desc: "End to end product work, from React and JavaScript to Spring Boot and Node services.",
        tags: "React · JavaScript · Spring Boot · Node",
      },
    ],
  },

  // --- Work cards. Add/remove/reorder. `img` is a gradient: pi1–pi4. ---
  work: {
    label: "", // kicker hidden (was "Work") — "Selected projects" is the heading
    heading: "Selected projects",
    projects: [
      {
        img: "pi1",
        badge: "AI Project",
        title: "Real Time LLM Enrichment Pipeline",
        desc: "Enriches live Kafka events with LLM calls, with a reliability layer and token budgeting.",
        chips: ["Java", "Kafka", "LLM APIs"],
        demoHref: "#",
        writeupHref: "/work/example-llm-enrichment-pipeline",
      },
      {
        img: "pi2",
        badge: "AI Project",
        title: "pgvector RAG Service",
        desc: "Retrieval augmented generation over a corpus, served as a streaming API with eval gating.",
        chips: ["Python", "pgvector", "FastAPI"],
        demoHref: "#",
        writeupHref: "/work/example-rag-service",
      },
      {
        img: "pi3",
        badge: "Nordstrom",
        title: "Real Time Inventory Platform",
        desc: "Unified inventory systems into one real time platform across 200+ locations.",
        chips: ["Java", "Kafka", "PostgreSQL"],
        demoHref: "",
        writeupHref: "#",
      },
      {
        img: "pi4",
        badge: "AI Project",
        title: "Tool Using AI Agent",
        desc: "Completes multi step tasks by planning and calling tools, with guardrails and evals.",
        chips: ["Python", "MCP", "Evals"],
        demoHref: "#",
        writeupHref: "#",
      },
    ],
  },

  // --- Journey timeline (most recent first). ---
  journey: {
    label: "The Journey",
    heading: "How I got here",
    items: [
      {
        yr: "2026 · NOW",
        role: "Building toward AI engineering",
        co: "· independent",
        cx: "RAG, agents, and evals, designed like production software and written about in the open.",
      },
      {
        yr: "Aug 2022 – Apr 2026 · Seattle",
        role: "Senior Software Engineer, Tech Lead",
        co: "· Nordstrom",
        cx: "Led real time inventory platform work, including a cache reconciliation service and a cutover across 200+ locations.",
      },
      {
        yr: "Dec 2020 – Jul 2022 · Seattle",
        role: "Software Engineer II",
        co: "· Nordstrom",
        cx: "Built Kafka based streaming with Avro schemas and a serverless observability stack on AWS.",
      },
      {
        yr: "Jan 2020 – Nov 2020 · Seattle",
        role: "Software Engineer I",
        co: "· Nordstrom",
        cx: "Worked on the inventory systems of record that the real time platform was later built on.",
      },
      {
        yr: "Jul 2018 – Dec 2019 · Dallas",
        role: "Software Engineer",
        co: "· Cox Automotive",
        cx: "Front end and platform work serving 15,000+ dealerships from a shared codebase.",
      },
      {
        yr: "2018 · Syracuse",
        role: "M.S. Computer Science",
        co: "· Syracuse University",
        cx: "Graduate study in computer science.",
      },
      {
        yr: "2015 · Hyderabad",
        role: "B.S. Computer Science",
        co: "· JNTU (VNR VJIET)",
        cx: "Undergraduate degree in computer science.",
      },
    ],
  },

  // --- Skills row. Each: { label, icon }. icon = a Simple Icons slug, or
  //     null for ones without a clean brand mark (renders text only).
  //     Find slugs at https://simpleicons.org (use the lowercase name).
  skills: {
    label: "Skills & Tools",
    heading: "What I work with",
    items: [
      { label: "Java", icon: null },
      { label: "Python", icon: "python" },
      { label: "Kafka", icon: "apachekafka" },
      { label: "Spark", icon: "apachespark" },
      { label: "Flink", icon: "apacheflink" },
      { label: "Airflow", icon: "apacheairflow" },
      { label: "Spring Boot", icon: "springboot" },
      { label: "Node", icon: "nodedotjs" },
      { label: "React", icon: "react" },
      { label: "Redux", icon: "redux" },
      { label: "Angular", icon: "angular" },
      { label: "PostgreSQL", icon: "postgresql" },
      { label: "Redis", icon: "redis" },
      { label: "AWS", icon: null },
      { label: "Kubernetes", icon: "kubernetes" },
      { label: "Docker", icon: "docker" },
      { label: "Kong", icon: "kong" },
      { label: "Datadog", icon: "datadog" },
      { label: "New Relic", icon: "newrelic" },
      { label: "Splunk", icon: "splunk" },
      { label: "Prometheus", icon: "prometheus" },
      { label: "Grafana", icon: "grafana" },
      { label: "OpenTelemetry", icon: "opentelemetry" },
    ],
  },

  // --- Consult chat (static interface). Edit the scripted bubbles here. ---
  consult: {
    label: "Consult",
    heading: "Let's talk",
    agentName: "Ram",
    status: "● usually replies in a day",
    inputPlaceholder: "Tell me about your project...",
    // role: "them" = Ram (left bubble), "me" = visitor (right bubble)
    messages: [
      { role: "them", text: "Hey, I'm Ram. What are you working on?" },
      {
        role: "me",
        text: "We're building an LLM feature and our Kafka pipeline keeps falling over under load.",
      },
      {
        role: "them",
        text: "That's squarely my thing. Want a quick architecture review, or hands on help?",
      },
    ],
    quickReplies: ["Architecture review", "Hands on build", "Just exploring"],
  },
};
