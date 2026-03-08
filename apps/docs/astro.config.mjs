// @ts-check

import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightThemeBlack from "starlight-theme-black";

// https://astro.build/config
export default defineConfig({
  base: "/docs",
  integrations: [
    starlight({
      title: "Vyft",
      logo: {
        dark: "./src/assets/logo-dark.svg",
        light: "./src/assets/logo-light.svg",
      },
      plugins: [
        starlightThemeBlack({
          navLinks: [
            { label: "Docs", link: "/docs" },
          ],
        }),
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/vyftlabs/vyft",
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "getting-started/introduction" },
            { label: "Installation", slug: "getting-started/installation" },
            { label: "Quick Start", slug: "getting-started/quick-start" },
          ],
        },
        {
          label: "Resources",
          items: [
            { label: "Service", slug: "resources/service" },
            { label: "Job", slug: "resources/job" },
            { label: "Cron Job", slug: "resources/cronjob" },
            { label: "Volume", slug: "resources/volume" },
          ],
        },
        {
          label: "Standard Library",
          items: [
{ label: "Glob", slug: "std/glob" },
            { label: "Template", slug: "std/template" },
            { label: "Crypto", slug: "std/crypto" },
          ],
        },
        {
          label: "CLI",
          items: [
            { label: "Commands", slug: "cli/commands" },
          ],
        },
      ],
    }),
  ],
});
