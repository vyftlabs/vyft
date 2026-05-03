import {
  BoxIcon,
  ContainerIcon,
  KeyRoundIcon,
  SettingsIcon,
  WorkflowIcon,
} from "lucide-react";
import type * as React from "react";
import { Link, useParams } from "react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { project } = useParams();

  const base = `/projects/${project}`;

  const projectNavItems = project
    ? [
        { title: "Services", url: `${base}/services`, icon: <WorkflowIcon /> },
        {
          title: "Variables",
          url: `${base}/variables`,
          icon: <KeyRoundIcon />,
        },
      ]
    : [];

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarContent>
        {project && projectNavItems.length > 0 && (
          <SidebarGroup>
            <SidebarMenu>
              {projectNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    render={<Link to={item.url} />}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
        {project && (
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Settings"
                  render={<Link to={`/projects/${project}/settings`} />}
                >
                  <SettingsIcon />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {!project && (
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Projects"
                  render={<Link to="/projects" />}
                >
                  <BoxIcon />
                  <span>Projects</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
        {!project && (
          <SidebarGroup>
            <SidebarGroupLabel>Manage</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Registries"
                  render={<Link to="/registries" />}
                >
                  <ContainerIcon />
                  <span>Registries</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

      </SidebarContent>
    </Sidebar>
  );
}
