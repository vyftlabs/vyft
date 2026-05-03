import { QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

export const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      onError: (err: Error) => toast.error(err.message),
    },
  },
})
