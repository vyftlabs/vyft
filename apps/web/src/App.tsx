import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import Layout from "./components/layout";
import PageContainer from "./components/page-container";

const Projects = lazy(() => import("./pages/projects/index"));
const Services = lazy(() => import("./pages/projects/services/index"));
const ProjectSettings = lazy(() => import("./pages/projects/settings/index"));
const SharedVariables = lazy(() => import("./pages/projects/variables/index"));
const Registries = lazy(() => import("./pages/registries/index"));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route element={<Layout />}>
            <Route element={<PageContainer />}>
              <Route path="/" element={<Projects />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/registries" element={<Registries />} />
            </Route>
          </Route>
          <Route path="/projects/:project" element={<Layout />}>
            <Route index element={<Navigate to="services" replace />} />
            <Route path="services" element={<Services />} />
            <Route element={<PageContainer />}>
              <Route path="variables" element={<SharedVariables />} />
            </Route>
            <Route element={<PageContainer wide />}>
              <Route path="settings" element={<ProjectSettings />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
