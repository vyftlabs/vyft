import type { Page } from "@playwright/test";

import * as actions from "./actions.ts";
import type { CreateInput, ImageInput } from "./actions.ts";
import type { ProjectHandle } from "../types.ts";

/**
 * A thenable chain of project-scoped UI actions. Each method enqueues an
 * op against the underlying promise; awaiting the chain runs ops in order
 * and resolves to the {@link ProjectHandle}.
 *
 *     const proj = await project
 *       .create(page, { slug, name })
 *       .createImageService({ name: "nginx", image: "nginx:alpine", port: 80 })
 *       .deploy();
 */
export type ProjectChain = Promise<ProjectHandle> & {
  createImageService(input: ImageInput): ProjectChain;
  deploy(opts?: { timeoutMs?: number }): ProjectChain;
  remove(): ProjectChain;
};

function attach(p: Promise<ProjectHandle>, page: Page): ProjectChain {
  const methods = {
    createImageService(input: ImageInput): ProjectChain {
      return attach(
        p.then(async (h) => {
          const res = await actions.createImageService(page, input);
          h.resources[res.name] = res;
          return h;
        }),
        page,
      );
    },
    deploy(opts: { timeoutMs?: number } = {}): ProjectChain {
      return attach(
        p.then(async (h) => {
          await actions.deploy(page, opts);
          return h;
        }),
        page,
      );
    },
    remove(): ProjectChain {
      return attach(
        p.then(async (h) => {
          await actions.remove(page, h.slug);
          return h;
        }),
        page,
      );
    },
  };
  return Object.assign(p, methods) as ProjectChain;
}

export function create(page: Page, input: CreateInput): ProjectChain {
  return attach(actions.create(page, input), page);
}
