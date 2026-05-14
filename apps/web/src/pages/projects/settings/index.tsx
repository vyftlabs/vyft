import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { DangerZone } from "@/components/ui/danger-zone";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as api from "@/lib/api";

const triggerClasses =
  "after:!hidden data-active:bg-accent data-active:text-foreground rounded-md";

function Section({
  title,
  description,
  trailing,
  children,
}: {
  title: string;
  description?: string;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {description}
            </p>
          )}
        </div>
        {trailing}
      </div>
      {children}
    </div>
  );
}

// ─── General Tab ────────────────────────────────────────────────────

function GeneralTab() {
  const { project: slug } = useParams<{ project: string }>();
  const navigate = useNavigate();
  const { data: projectData } = useQuery({
    ...api.projects.bySlug(slug ?? ""),
    enabled: !!slug,
  });
  const [name, setName] = useState("");

  const [initialized, setInitialized] = useState(false);
  if (projectData && !initialized) {
    setName(projectData.name);
    setInitialized(true);
  }

  const updateProject = useMutation(api.projects.update);
  const deleteProject = useMutation(api.projects.remove);

  return (
    <div className="space-y-8">
      <Section
        title="Project"
        description="Manage your project name and identity."
      >
        <div className="max-w-sm space-y-3">
          <Field>
            <FieldLabel className="text-xs">Name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button
            size="sm"
            disabled={
              !projectData ||
              name === projectData.name ||
              !name.trim() ||
              updateProject.isPending
            }
            onClick={() => {
              if (projectData)
                updateProject.mutate({
                  id: projectData.id,
                  body: { name: name.trim() },
                });
            }}
          >
            Save
          </Button>
        </div>
      </Section>

      <DangerZone
        title="Delete project"
        description="Permanently delete this project and all of its resources. This action cannot be undone."
        action="Delete project"
        onAction={async () => {
          if (!projectData) return;
          await deleteProject.mutateAsync(projectData.id);
          navigate("/");
        }}
        disabled={deleteProject.isPending}
        confirmTitle="Are you absolutely sure?"
        confirmDescription="This will permanently delete this project and all of its services, secrets, registries, and routes. This action cannot be undone."
        confirmInput={slug}
      />
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "general";

  return (
    <Tabs
      value={activeTab}
      orientation="vertical"
      className="gap-8 h-full"
      onValueChange={(tab) => {
        if (tab === "general") {
          searchParams.delete("tab");
        } else {
          searchParams.set("tab", tab);
        }
        setSearchParams(searchParams, { replace: true });
      }}
    >
      <div className="w-44 shrink-0 p-12">
        <h1 className="text-2xl font-semibold mb-6">Settings</h1>
        <TabsList variant="line">
          <TabsTrigger value="general" className={triggerClasses}>
            General
          </TabsTrigger>
        </TabsList>
      </div>
      <ScrollArea className="flex-1 min-w-0">
        <div className="pt-26 px-8 pb-8">
          <TabsContent value="general">
            <GeneralTab />
          </TabsContent>
        </div>
      </ScrollArea>
    </Tabs>
  );
}
