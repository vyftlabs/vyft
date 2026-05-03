import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import {
  PlusIcon,
  CheckCircle2Icon,
  CircleIcon,
  XCircleIcon,
  LoaderIcon,
  ArrowLeftIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  List,
  ListItem,
  ListIcon,
  ListContent,
  ListTitle,
  ListDescription,
  ListAction,
} from "@/components/ui/list"
import { DangerZone } from "@/components/ui/danger-zone"
import { cn } from "@/lib/utils"
import {
  integrationCategories,
  providersForCapability,
  getProvider,
  type IntegrationSlot,
  type IntegrationProvider,
} from "@/lib/integration-presets"

type SlotState = {
  providerId: string
  config: Record<string, string>
  status: "healthy" | "error" | "unknown"
}

type IntegrationsState = Record<string, SlotState | undefined>

export default function Integrations() {
  const [state, setState] = useState<IntegrationsState>({})
  const [editing, setEditing] = useState<IntegrationSlot | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect external services for observability, notifications, and more.
        </p>
      </div>

      <div className="space-y-8">
        {integrationCategories.map((cat) => (
          <div key={cat.id} className="space-y-3">
            <div>
              <h2 className="text-sm font-medium">{cat.name}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
            </div>
            <div className="rounded-lg border bg-card overflow-hidden">
              <List>
                {cat.slots.map((slot) => (
                  <SlotRow
                    key={slot.id}
                    slot={slot}
                    state={state[slot.id]}
                    onConfigure={() => setEditing(slot)}
                  />
                ))}
              </List>
            </div>
          </div>
        ))}
      </div>

      <ConfigureDialog
        slot={editing}
        state={editing ? state[editing.id] : undefined}
        onClose={() => setEditing(null)}
        onSave={(slotId, next) => {
          setState((prev) => ({ ...prev, [slotId]: next }))
          setEditing(null)
        }}
        onDisconnect={(slotId) => {
          setState((prev) => {
            const next = { ...prev }
            delete next[slotId]
            return next
          })
          setEditing(null)
        }}
      />
    </div>
  )
}

function SlotRow({
  slot,
  state,
  onConfigure,
}: {
  slot: IntegrationSlot
  state: SlotState | undefined
  onConfigure: () => void
}) {
  const provider = state ? getProvider(state.providerId) : undefined
  const SlotIcon = slot.icon
  const ProviderIcon = provider?.icon

  return (
    <ListItem className="cursor-pointer" onClick={onConfigure}>
      <ListIcon>
        {ProviderIcon ? <ProviderIcon /> : <SlotIcon />}
      </ListIcon>
      <ListContent>
        <div className="flex items-center gap-2">
          <ListTitle>{slot.name}</ListTitle>
          {state && <StatusDot status={state.status} />}
        </div>
        <ListDescription>
          {provider ? provider.name : slot.description}
        </ListDescription>
      </ListContent>
      <ListAction>
        {state ? (
          <span className="text-xs text-muted-foreground">Configure</span>
        ) : (
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onConfigure() }}>
            <PlusIcon />
            Connect
          </Button>
        )}
      </ListAction>
    </ListItem>
  )
}

function StatusDot({ status }: { status: SlotState["status"] }) {
  const cls = status === "healthy"
    ? "bg-emerald-500"
    : status === "error"
      ? "bg-destructive"
      : "bg-muted-foreground"
  return <span className={cn("inline-block size-1.5 rounded-full", cls)} aria-label={status} />
}

function ConfigureDialog({
  slot,
  state,
  onClose,
  onSave,
  onDisconnect,
}: {
  slot: IntegrationSlot | null
  state: SlotState | undefined
  onClose: () => void
  onSave: (slotId: string, next: SlotState) => void
  onDisconnect: (slotId: string) => void
}) {
  return (
    <Dialog open={slot !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="p-0 gap-0 overflow-hidden sm:max-w-md">
        {slot && (
          <ConfigureDialogBody
            slot={slot}
            state={state}
            onSave={(next) => onSave(slot.id, next)}
            onDisconnect={() => onDisconnect(slot.id)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ConfigureDialogBody({
  slot,
  state,
  onSave,
  onDisconnect,
}: {
  slot: IntegrationSlot
  state: SlotState | undefined
  onSave: (next: SlotState) => void
  onDisconnect: () => void
}) {
  const providers = useMemo(() => providersForCapability(slot.capability), [slot.capability])
  const [providerId, setProviderId] = useState<string | null>(state?.providerId ?? null)
  const [picking, setPicking] = useState(state == null)

  const provider = providerId ? getProvider(providerId) : undefined

  if (picking || !provider) {
    return (
      <Command className="rounded-none border-0">
        <CommandInput placeholder={`Search ${slot.name.toLowerCase()} providers...`} />
        <CommandList>
          <CommandEmpty>No provider found.</CommandEmpty>
          <CommandGroup heading={`${slot.name} providers`}>
            {providers.map((p) => {
              const PIcon = p.icon
              return (
                <CommandItem
                  key={p.id}
                  onSelect={() => { setProviderId(p.id); setPicking(false) }}
                >
                  <PIcon className="text-muted-foreground" />
                  {p.name}
                </CommandItem>
              )
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    )
  }

  return (
    <ProviderForm
      slot={slot}
      provider={provider}
      state={state?.providerId === provider.id ? state : undefined}
      onBack={() => setPicking(true)}
      onSave={onSave}
      onDisconnect={state ? onDisconnect : undefined}
    />
  )
}

function ProviderForm({
  slot,
  provider,
  state,
  onBack,
  onSave,
  onDisconnect,
}: {
  slot: IntegrationSlot
  provider: IntegrationProvider
  state: SlotState | undefined
  onBack: () => void
  onSave: (next: SlotState) => void
  onDisconnect?: () => void
}) {
  const [testStatus, setTestStatus] = useState<SlotState["status"]>(state?.status ?? "unknown")
  const [testing, setTesting] = useState(false)

  const { register, handleSubmit, getValues } = useForm({
    defaultValues: provider.fields.reduce<Record<string, string>>((acc, f) => {
      acc[f.key] = state?.config?.[f.key] ?? ""
      return acc
    }, {}),
  })

  const onSubmit = handleSubmit((data) => {
    const trimmed = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]),
    )
    onSave({ providerId: provider.id, config: trimmed, status: testStatus })
  })

  const onTest = () => {
    const values = getValues()
    const missing = provider.fields.some((f) => f.required && !values[f.key]?.trim())
    if (missing) {
      toast.error("Fill required fields first.")
      return
    }
    setTesting(true)
    setTimeout(() => {
      const ok = Math.random() > 0.2
      setTestStatus(ok ? "healthy" : "error")
      setTesting(false)
      if (!ok) toast.error("Connection failed.")
    }, 800)
  }

  const ProviderIcon = provider.icon

  return (
    <form onSubmit={onSubmit} className="flex flex-col">
      <DialogHeader className="px-6 pt-4 pb-0 flex-row items-center gap-3 space-y-0">
        <Button type="button" variant="ghost" size="icon-sm" onClick={onBack}>
          <ArrowLeftIcon className="size-4" />
        </Button>
        <ProviderIcon className="size-5 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <DialogTitle>{provider.name}</DialogTitle>
          <DialogDescription>{slot.name}</DialogDescription>
        </div>
      </DialogHeader>

      <div className="space-y-3 px-6 py-4">
        {provider.fields.map((f) => (
          <Field key={f.key}>
            <FieldLabel>
              {f.label}
              {f.required && <span className="text-destructive ml-0.5">*</span>}
            </FieldLabel>
            <Input
              {...register(f.key, { required: f.required })}
              type={f.type === "password" ? "password" : "text"}
              placeholder={f.placeholder}
              className={cn(f.mono && "font-mono")}
            />
          </Field>
        ))}

        <div className="flex items-center gap-3 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={onTest} disabled={testing}>
            {testing ? <LoaderIcon className="size-3.5 animate-spin" /> : null}
            Test connection
          </Button>
          <TestStatus status={testStatus} testing={testing} />
        </div>

        {onDisconnect && (
          <div className="pt-4">
            <DangerZone
              title="Disconnect"
              description={`Remove ${provider.name} from ${slot.name.toLowerCase()}.`}
              action="Disconnect"
              confirmTitle={`Disconnect ${provider.name}?`}
              confirmDescription={`This will remove the ${provider.name} connection from ${slot.name.toLowerCase()}. You can reconnect at any time.`}
              onAction={onDisconnect}
            />
          </div>
        )}
      </div>

      <DialogFooter className="px-6 py-4 border-t mx-0 mb-0 rounded-none">
        <Button type="submit" className="w-full">Save</Button>
      </DialogFooter>
    </form>
  )
}

function TestStatus({ status, testing }: { status: SlotState["status"]; testing: boolean }) {
  if (testing) return <span className="text-xs text-muted-foreground">Testing...</span>
  if (status === "healthy") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-500">
        <CheckCircle2Icon className="size-3.5" />
        Connected
      </span>
    )
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <XCircleIcon className="size-3.5" />
        Failed
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <CircleIcon className="size-3.5" />
      Not tested
    </span>
  )
}
