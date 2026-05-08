import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ProjectCreate } from "@vyft/spec";
import { LoaderIcon } from "lucide-react";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import * as api from "@/lib/api";

const schema = ProjectCreate.omit({ description: true });
type FormValues = z.infer<typeof schema>;

function nameToSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const createProject = useMutation(api.projects.create);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", slug: "" },
  });

  const name = useWatch({ control, name: "name" });

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  useEffect(() => {
    setValue("slug", nameToSlug(name));
  }, [name, setValue]);

  const onSubmit = async (data: FormValues) => {
    try {
      const project = await createProject.mutateAsync(data);
      onOpenChange(false);
      navigate(`/projects/${project.slug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Create a project</DialogTitle>
            <DialogDescription>
              Projects are isolated environments for your services, secrets, and
              routes.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <Field data-invalid={errors.name ? true : undefined}>
              <FieldLabel htmlFor="name">Project name</FieldLabel>
              <Input
                {...register("name")}
                id="name"
                placeholder="My Project"
                autoFocus
                data-testid="project-name-input"
              />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={errors.slug ? true : undefined}>
              <FieldLabel htmlFor="slug">Slug</FieldLabel>
              <Input {...register("slug")} id="slug" placeholder="my-project" />
              <FieldError errors={[errors.slug]} />
            </Field>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={createProject.isPending}
              data-testid="project-create-submit"
            >
              {createProject.isPending ? (
                <>
                  <LoaderIcon className="animate-spin" /> Creating...
                </>
              ) : (
                "Create project"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
