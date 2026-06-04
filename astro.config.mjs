// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import icon from "astro-icon";

// https://astro.build/config
export default defineConfig({
  // Set this to your real domain when you deploy (used by sitemap/RSS).
  site: "https://example.com",
  integrations: [
    mdx(),
    sitemap(),
    icon({
      include: {
        "simple-icons": [
          "python",
          "apachekafka",
          "apachespark",
          "apacheflink",
          "apacheairflow",
          "springboot",
          "nodedotjs",
          "react",
          "redux",
          "angular",
          "postgresql",
          "redis",
          "kubernetes",
          "docker",
          "kong",
          "datadog",
          "newrelic",
          "splunk",
          "prometheus",
          "grafana",
          "opentelemetry",
        ],
      },
    }),
  ],
});
