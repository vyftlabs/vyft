import { BrowserRouter, Routes, Route, Navigate } from "react-router"
import Layout from "./components/layout"
import PageContainer from "./components/page-container"
import Projects from "./pages/projects/index"
import Services from "./pages/projects/services/index"
import Registries from "./pages/registries/index"
import Integrations from "./pages/integrations/index"
import ProjectSettings from "./pages/projects/settings/index"
import SharedVariables from "./pages/projects/variables/index"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route element={<PageContainer />}>
            <Route path="/" element={<Projects />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/registries" element={<Registries />} />
            <Route path="/integrations" element={<Integrations />} />
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
    </BrowserRouter>
  )
}
