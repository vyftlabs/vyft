import type { DockerClient } from "@vyft/docker/client";
import type { K8sClient, K8sManifest } from "@vyft/kubernetes/client";

export function createMockDockerClient(): DockerClient {
  return {
    async get() {
      return {};
    },
    async post() {
      return { Id: "mock-id" };
    },
    async del() {},
    async postStream() {
      return {};
    },
  };
}

export function createMockK8sClient(): K8sClient {
  const noop = async () => {};
  const manifest = async () => ({ metadata: { name: "" } }) as K8sManifest;
  return {
    readNamespace: manifest,
    createNamespace: noop,
    deleteNamespace: noop,
    readPVC: manifest,
    createPVC: noop,
    deletePVC: noop,
    readDeployment: manifest,
    createDeployment: noop,
    replaceDeployment: noop,
    deleteDeployment: noop,
    readService: manifest,
    createService: noop,
    replaceService: noop,
    deleteService: noop,
    readCronJob: manifest,
    createCronJob: noop,
    replaceCronJob: noop,
    deleteCronJob: noop,
    createIngress: noop,
    replaceIngress: noop,
    deleteIngress: noop,
    listPods: async () => ({ items: [] }),
  };
}
