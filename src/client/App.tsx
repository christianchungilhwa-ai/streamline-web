import { Routes, Route, Navigate } from "react-router-dom";
import { LecturesPage } from "./pages/LecturesPage";
import { UploadPage } from "./pages/UploadPage";
import { LectureViewerPage } from "./pages/LectureViewerPage";
import { AppShell } from "./components/AppShell";

/** Top-level router. All routes are session-gated by the AppShell, which
 *  redirects anonymous visitors to claraity.app/login (the canonical
 *  login lives on the main Claraity domain — we share the session). */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/lectures" replace />} />
        <Route path="/lectures" element={<LecturesPage />} />
        <Route path="/lectures/new" element={<UploadPage />} />
        <Route path="/lectures/:id" element={<LectureViewerPage />} />
        <Route path="*" element={<Navigate to="/lectures" replace />} />
      </Route>
    </Routes>
  );
}
