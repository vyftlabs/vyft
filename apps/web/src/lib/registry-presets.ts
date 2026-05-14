import { Container, GitBranch, Settings } from "lucide-react";
import type React from "react";

export interface RegistryPreset {
  id: string;
  name: string;
  url: string;
  icon: React.FC<{ className?: string }>;
}

export const registryPresets: RegistryPreset[] = [
  { id: "ghcr", name: "GitHub", url: "ghcr.io", icon: GitBranch },
  { id: "docker", name: "Docker Hub", url: "docker.io", icon: Container },
  { id: "custom", name: "Custom", url: "", icon: Settings },
];
