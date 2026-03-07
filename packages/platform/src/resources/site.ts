import { defineResource } from "@vyft/provider";

export interface SiteArgs {
  path?: string;
  domain?: string;
}

export const siteResource = defineResource<SiteArgs>("site", {});
