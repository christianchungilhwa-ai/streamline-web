import { Routes, Route, Navigate } from "react-router-dom";
import { LecturesPage } from "./pages/LecturesPage";
import { UploadPage } from "./pages/UploadPage";
import { LectureViewerPage } from "./pages/LectureViewerPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { AppShell } from "./components/AppShell";
import { NotebookText, Users, Globe } from "lucide-react";

/** Top-level router. All routes are session-gated by the AppShell, which
 *  redirects anonymous visitors to claraity.app/login (the canonical
 *  login lives on the main Claraity domain — we share the session).
 *
 *  /studyguides, /shared, /community are sidebar destinations whose
 *  backends aren't built yet — the routes exist to reserve the URL
 *  and let the sidebar feel complete; each renders ComingSoonPage. */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/lectures" replace />} />
        <Route path="/lectures" element={<LecturesPage />} />
        <Route path="/lectures/new" element={<UploadPage />} />
        <Route path="/lectures/:id" element={<LectureViewerPage />} />

        {/* Stubbed destinations — see ComingSoonPage. */}
        <Route
          path="/studyguides"
          element={
            <ComingSoonPage
              title="My Studyguides"
              description="Saved study guides — distilled notes generated from your lectures, organized by topic so you can revisit the highlights without rewatching the recording."
              icon={<NotebookText className="h-7 w-7" />}
            />
          }
        />
        <Route
          path="/shared"
          element={
            <ComingSoonPage
              title="Shared with me"
              description="Lectures and study guides shared with you by classmates, study groups, or instructors. You'll see everything that's been sent your way in one place."
              icon={<Users className="h-7 w-7" />}
            />
          }
        />
        <Route
          path="/community"
          element={
            <ComingSoonPage
              title="Community"
              description="Public lectures and study guides shared by the wider Streamline community — browse, save, and learn from materials posted by other users."
              icon={<Globe className="h-7 w-7" />}
            />
          }
        />

        <Route path="*" element={<Navigate to="/lectures" replace />} />
      </Route>
    </Routes>
  );
}
