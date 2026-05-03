import { useState } from "react"
import { PlusIcon, Trash2Icon, LockIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table"

export interface RouteEntry {
  domain: string
  path: string
  pathType: string
  port: number
  tls: boolean
  redirectScheme?: string
  redirectStatusCode?: number
  rewritePath?: string
  stripPrefix?: string
  rateLimit?: number
  timeout?: number
  retries?: number
  corsOrigins?: string
  corsMethods?: string
  corsHeaders?: string
  corsMaxAge?: number
}

const defaultRoute: RouteEntry = {
  domain: "",
  path: "/",
  pathType: "prefix",
  port: 0,
  tls: true,
}

export function RoutesForm({
  routes,
  onChange,
  defaultPort,
  onAddClick,
}: {
  routes: RouteEntry[]
  onChange: (routes: RouteEntry[]) => void
  defaultPort?: number
  onAddClick?: () => void
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<RouteEntry>({ ...defaultRoute, port: defaultPort ?? 8080 })

  const update = (updates: Partial<RouteEntry>) => setForm((f) => ({ ...f, ...updates }))

  const handleAdd = () => {
    if (!form.domain.trim()) return
    onChange([...routes, { ...form, domain: form.domain.trim() }])
    setForm({ ...defaultRoute, port: defaultPort ?? 8080 })
    setDialogOpen(false)
  }

  return (
    <div className="space-y-3">
      {routes.length > 0 && (
        <Table>
          <TableBody>
            {routes.map((route, i) => (
              <TableRow key={i} className="group">
                <TableCell className="font-mono text-xs">
                  <span className="flex items-center gap-1.5">
                    {route.tls && <LockIcon className="size-3 text-muted-foreground" />}
                    {route.domain}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{route.path}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{route.port}</TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={() => onChange(routes.filter((_, j) => j !== i))}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => onAddClick ? onAddClick() : setDialogOpen(true)}
      >
        <PlusIcon />
        Add route
      </Button>

      {!onAddClick && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg h-[70vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>Add route</DialogTitle>
            <DialogDescription>Map a domain to this service.</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="general" className="mt-4 flex flex-col min-h-0 flex-1">
            <TabsList variant="line" className="border-b !w-full !justify-start [&>*]:!flex-none [&>*]:mb-[-1px] px-6">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="rewrite">Rewrite</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="reliability">Reliability</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="flex-1 overflow-y-auto mt-4 px-6 pb-6 space-y-4">
              <Field>
                <FieldLabel>Domain</FieldLabel>
                <Input
                  value={form.domain}
                  onChange={(e) => update({ domain: e.target.value })}
                  placeholder="example.com"
                  autoFocus
                />
              </Field>

              <div className="flex items-end gap-3">
                <Field className="!flex-1 !w-auto min-w-0">
                  <FieldLabel>Path</FieldLabel>
                  <Input
                    value={form.path}
                    onChange={(e) => update({ path: e.target.value })}
                    placeholder="/"
                    className="font-mono"
                  />
                </Field>
                <Field className="!w-auto shrink-0">
                  <FieldLabel>Match</FieldLabel>
                  <Select value={form.pathType} onValueChange={(v) => update({ pathType: v ?? undefined })}>
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prefix">Prefix</SelectItem>
                      <SelectItem value="exact">Exact</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field>
                <FieldLabel>Port</FieldLabel>
                <Input
                  type="number"
                  value={form.port}
                  onChange={(e) => update({ port: parseInt(e.target.value) || 0 })}
                  placeholder="8080"
                  className="font-mono"
                />
              </Field>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">TLS</p>
                  <p className="text-xs text-muted-foreground">Encrypt traffic with HTTPS</p>
                </div>
                <Switch checked={form.tls} onCheckedChange={(v) => update({ tls: v })} />
              </div>

              {form.tls && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">HTTP redirect</p>
                    <p className="text-xs text-muted-foreground">Redirect HTTP to HTTPS</p>
                  </div>
                  <Switch
                    checked={!!form.redirectScheme}
                    onCheckedChange={(v) => update({
                      redirectScheme: v ? "https" : undefined,
                      redirectStatusCode: v ? 301 : undefined,
                    })}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="rewrite" className="flex-1 overflow-y-auto mt-4 px-6 pb-6 space-y-4">
              <Field>
                <FieldLabel>Strip prefix</FieldLabel>
                <Input
                  value={form.stripPrefix ?? ""}
                  onChange={(e) => update({ stripPrefix: e.target.value || undefined })}
                  placeholder="/api"
                  className="font-mono"
                />
                <FieldDescription>Remove this prefix before forwarding to the service</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Replace path</FieldLabel>
                <Input
                  value={form.rewritePath ?? ""}
                  onChange={(e) => update({ rewritePath: e.target.value || undefined })}
                  placeholder="/v2"
                  className="font-mono"
                />
                <FieldDescription>Replace the entire path with this value</FieldDescription>
              </Field>
            </TabsContent>

            <TabsContent value="security" className="flex-1 overflow-y-auto mt-4 px-6 pb-6 space-y-4">
              <Field>
                <FieldLabel>Rate limit</FieldLabel>
                <Input
                  type="number"
                  value={form.rateLimit ?? ""}
                  onChange={(e) => update({ rateLimit: parseInt(e.target.value) || undefined })}
                  placeholder="100"
                />
                <FieldDescription>Maximum requests per second</FieldDescription>
              </Field>

              <Field>
                <FieldLabel>CORS origins</FieldLabel>
                <Input
                  value={form.corsOrigins ?? ""}
                  onChange={(e) => update({ corsOrigins: e.target.value || undefined })}
                  placeholder="https://example.com, https://app.example.com"
                  className="font-mono"
                />
                <FieldDescription>Comma-separated allowed origins</FieldDescription>
              </Field>

              <Field>
                <FieldLabel>CORS methods</FieldLabel>
                <Input
                  value={form.corsMethods ?? ""}
                  onChange={(e) => update({ corsMethods: e.target.value || undefined })}
                  placeholder="GET, POST, PUT, DELETE"
                  className="font-mono"
                />
              </Field>

              <Field>
                <FieldLabel>CORS headers</FieldLabel>
                <Input
                  value={form.corsHeaders ?? ""}
                  onChange={(e) => update({ corsHeaders: e.target.value || undefined })}
                  placeholder="Authorization, Content-Type"
                  className="font-mono"
                />
              </Field>

              <Field>
                <FieldLabel>CORS max age</FieldLabel>
                <Input
                  type="number"
                  value={form.corsMaxAge ?? ""}
                  onChange={(e) => update({ corsMaxAge: parseInt(e.target.value) || undefined })}
                  placeholder="86400"
                />
                <FieldDescription>Preflight cache duration in seconds</FieldDescription>
              </Field>
            </TabsContent>

            <TabsContent value="reliability" className="flex-1 overflow-y-auto mt-4 px-6 pb-6 space-y-4">
              <Field>
                <FieldLabel>Timeout</FieldLabel>
                <Input
                  type="number"
                  value={form.timeout ?? ""}
                  onChange={(e) => update({ timeout: parseInt(e.target.value) || undefined })}
                  placeholder="30"
                />
                <FieldDescription>Request timeout in seconds</FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Retries</FieldLabel>
                <Input
                  type="number"
                  value={form.retries ?? ""}
                  onChange={(e) => update({ retries: parseInt(e.target.value) || undefined })}
                  placeholder="3"
                />
                <FieldDescription>Number of retry attempts on failure</FieldDescription>
              </Field>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mx-0 mb-0 rounded-none px-6 py-4">
            <Button
              type="button"
              className="w-full"
              disabled={!form.domain.trim()}
              onClick={handleAdd}
            >
              Add route
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
  )
}
