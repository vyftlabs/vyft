import { CheckIcon, CopyIcon, DicesIcon, LockIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ServiceIcon } from "@/components/service/node";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export interface VariableFormValues {
  key: string;
  value: string;
  secret: boolean;
}

export interface VariableSuggestion {
  id: string;
  key: string;
  secret: boolean;
  resourceName?: string;
  resourceImage?: string;
}

export interface SuggestionGroup {
  label: string;
  image?: string;
  items: VariableSuggestion[];
}

export interface VariableFormProps {
  suggestionGroups?: SuggestionGroup[];
  isPending?: boolean;
  onSubmit: (
    data: VariableFormValues & { sourceVariableId?: string },
  ) => void;
}

export function VariableForm({
  suggestionGroups = [],
  isPending,
  onSubmit,
}: VariableFormProps) {
  const { control, handleSubmit, reset, setValue, watch } =
    useForm<VariableFormValues>({
      defaultValues: { key: "", value: "", secret: true },
    });

  // `linked` is the source variable picked from suggestions. When set, the
  // value field shows a chip instead of a free-form input, and the secret
  // toggle is hidden (source decides). Cleared when user edits value.
  const [linked, setLinked] = useState<VariableSuggestion | null>(null);

  const keyValue = watch("key");
  const valueValue = watch("value");

  const handleFormSubmit = (data: VariableFormValues) => {
    onSubmit({
      key: data.key.trim(),
      value: linked ? "" : data.value,
      secret: linked ? false : data.secret,
      sourceVariableId: linked?.id,
    });
    reset();
    setLinked(null);
  };

  return (
    <form
      onSubmit={(e) => {
        e.stopPropagation();
        handleSubmit(handleFormSubmit)(e);
      }}
    >
      <div className="space-y-4">
        <Controller
          name="key"
          control={control}
          rules={{ required: "Key is required" }}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor={field.name}>Key</FieldLabel>
              <SuggestionInput
                id={field.name}
                value={field.value}
                onChange={(v) => field.onChange(v.toUpperCase())}
                onBlur={field.onBlur}
                placeholder="DATABASE_URL"
                groups={suggestionGroups}
                filterText={keyValue}
                onPick={(s) => {
                  setValue("key", s.key);
                  setLinked(s);
                }}
                testId="service.form.variables.dialog.key"
                autoFocus
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        {linked ? (
          <Field>
            <FieldLabel>Value</FieldLabel>
            <LinkedChip
              source={linked}
              onClear={() => {
                setLinked(null);
                setValue("value", "");
              }}
            />
          </Field>
        ) : (
          <Controller
            name="value"
            control={control}
            rules={{ required: "Value is required" }}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor={field.name}>Value</FieldLabel>
                <ValueInput
                  id={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  isSecret={watch("secret")}
                  groups={suggestionGroups}
                  filterText={valueValue}
                  onPick={(s) => setLinked(s)}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        )}

        {!linked && (
          <Controller
            name="secret"
            control={control}
            render={({ field }) => (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Secret</p>
                  <p className="text-xs text-muted-foreground">
                    Encrypt and hide the value
                  </p>
                </div>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="service.form.variables.dialog.secret"
                />
              </div>
            )}
          />
        )}
      </div>
      <div className="mt-4">
        <Button
          type="submit"
          className="w-full"
          disabled={isPending}
          data-testid="service.form.variables.dialog.submit"
        >
          {isPending && <Spinner />}
          Add variable
        </Button>
      </div>
    </form>
  );
}

// =============================================================================
// SuggestionInput — text input + dropdown filtered by `filterText`. Used for
// both Key and Value fields; differs only in styling (Value has the
// secret/copy/dice action buttons via ValueInput wrapper).
// =============================================================================

interface SuggestionInputProps {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  groups: SuggestionGroup[];
  filterText: string;
  onPick: (s: VariableSuggestion) => void;
  testId?: string;
  autoFocus?: boolean;
  // Optional adornment rendered inside the input on the right side.
  rightAdornment?: React.ReactNode;
  type?: "text" | "password";
  className?: string;
}

function SuggestionInput({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  groups,
  filterText,
  onPick,
  testId,
  autoFocus,
  rightAdornment,
  type = "text",
  className,
}: SuggestionInputProps) {
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredGroups = filterGroups(groups, filterText);
  const flatCount = filteredGroups.reduce((n, g) => n + g.items.length, 0);
  const showDropdown = focused && flatCount > 0;
  const effectiveHighlight = showDropdown ? highlight : -1;

  const flatItem = (idx: number): VariableSuggestion | undefined => {
    let off = 0;
    for (const g of filteredGroups) {
      if (idx < off + g.items.length) return g.items[idx - off];
      off += g.items.length;
    }
    return undefined;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => Math.min(i + 1, flatCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && effectiveHighlight >= 0) {
      e.preventDefault();
      const item = flatItem(effectiveHighlight);
      if (item) {
        onPick(item);
        setFocused(false);
      }
    } else if (e.key === "Escape") {
      setFocused(false);
    }
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("font-mono", rightAdornment && "pr-14", className)}
        autoComplete="off"
        autoFocus={autoFocus}
        data-testid={testId}
        onFocus={() => {
          setFocused(true);
          setHighlight(0);
        }}
        // Defer blur close so onClick on dropdown items can fire first.
        onBlur={() => {
          setTimeout(() => setFocused(false), 150);
          onBlur?.();
        }}
        onKeyDown={handleKeyDown}
      />
      {rightAdornment && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {rightAdornment}
        </div>
      )}
      {showDropdown && (
        <SuggestionDropdown
          groups={filteredGroups}
          highlight={effectiveHighlight}
          setHighlight={setHighlight}
          onPick={(s) => {
            onPick(s);
            setFocused(false);
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// ValueInput — SuggestionInput for the value field, with copy + random-value
// adornments and password masking when secret.
// =============================================================================

interface ValueInputProps {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  isSecret: boolean;
  groups: SuggestionGroup[];
  filterText: string;
  onPick: (s: VariableSuggestion) => void;
}

function ValueInput({
  id,
  value,
  onChange,
  onBlur,
  isSecret,
  groups,
  filterText,
  onPick,
}: ValueInputProps) {
  const [copied, setCopied] = useState(false);
  const adornment = (
    <>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground"
        title="Copy value"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? (
          <CheckIcon className="size-3.5" />
        ) : (
          <CopyIcon className="size-3.5" />
        )}
      </button>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground"
        title="Generate random value"
        onClick={() => {
          const arr = new Uint8Array(24);
          crypto.getRandomValues(arr);
          const generated = btoa(String.fromCharCode(...arr))
            .replace(/[+/=]/g, "")
            .slice(0, 32);
          onChange(generated);
        }}
      >
        <DicesIcon className="size-3.5" />
      </button>
    </>
  );
  return (
    <SuggestionInput
      id={id}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      placeholder={isSecret ? "••••••••" : "value"}
      groups={groups}
      filterText={filterText}
      onPick={onPick}
      testId="service.form.variables.dialog.value"
      type={isSecret ? "password" : "text"}
      rightAdornment={adornment}
    />
  );
}

// =============================================================================
// LinkedChip — replaces value input when key was picked from suggestions.
// =============================================================================

function LinkedChip({
  source,
  onClear,
}: {
  source: VariableSuggestion;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2 h-8 rounded-lg border border-input px-2.5 text-sm font-mono">
      <LockIcon className="size-3 text-muted-foreground shrink-0" />
      <span className="flex-1 text-muted-foreground truncate">
        {source.resourceName ? `${source.resourceName}.` : ""}
        {source.key}
      </span>
      <button
        type="button"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onClear}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}

// =============================================================================
// Shared dropdown rendering
// =============================================================================

function filterGroups(
  groups: SuggestionGroup[],
  text: string,
): SuggestionGroup[] {
  if (groups.length === 0) return [];
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (v) => !text || v.key.toLowerCase().includes(text.toLowerCase()),
      ),
    }))
    .filter((g) => g.items.length > 0);
}

function SuggestionDropdown({
  groups,
  highlight,
  setHighlight,
  onPick,
}: {
  groups: SuggestionGroup[];
  highlight: number;
  setHighlight: (i: number) => void;
  onPick: (s: VariableSuggestion) => void;
}) {
  return (
    <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-md border bg-popover shadow-md overflow-hidden max-h-56 overflow-y-auto">
      {groups.map((group, gi) => {
        const offset = groups
          .slice(0, gi)
          .reduce((n, g) => n + g.items.length, 0);
        return (
          <div key={group.label}>
            <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {group.image ? (
                <ServiceIcon image={group.image} size="xs" />
              ) : (
                <LockIcon className="size-2.5" />
              )}
              {group.label}
            </div>
            {group.items.map((v, i) => {
              const flatIndex = offset + i;
              return (
                <button
                  key={v.id}
                  type="button"
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-1.5 text-xs font-mono text-left",
                    flatIndex === highlight
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent",
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick(v)}
                  onMouseEnter={() => setHighlight(flatIndex)}
                >
                  {v.secret && (
                    <LockIcon className="size-3 text-muted-foreground" />
                  )}
                  {v.key}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
