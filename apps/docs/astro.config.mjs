// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  base: "/docs",
  integrations: [
    starlight({
      title: "Vyft",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/vyft/vyft",
        },
      ],
      sidebar: [
        {
          label: "Guides",
          items: [{ label: "Example Guide", slug: "guides/example" }],
        },
        {
          label: "Reference",
          autogenerate: { directory: "reference" },
        },
      ],
    }),
  ],
});
