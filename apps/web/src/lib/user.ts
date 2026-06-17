import { useQuery } from "@tanstack/react-query";

export interface CurrentUser {
  name: string;
  email: string;
  avatarUrl?: string;
}

// Single-user mode: no /me endpoint yet, so the acting user is hardcoded.
// When multi-user lands, swap the queryFn for a real fetch — call sites read
// through useCurrentUser(), so the UI slots are already in place.
const FALLBACK: CurrentUser = { name: "Admin", email: "admin@vyft.local" };

export function useCurrentUser(): CurrentUser {
  const { data } = useQuery({
    queryKey: ["currentUser"],
    queryFn: async (): Promise<CurrentUser> => FALLBACK,
    staleTime: Infinity,
    initialData: FALLBACK,
  });
  return data;
}

export function userInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}
