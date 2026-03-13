import { createRuntime } from "@vyft/runtime";
import { createContext } from "./context.ts";

export const docker = createRuntime("docker", createContext);
