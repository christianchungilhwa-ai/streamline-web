import { Routes, Route, Navigate } from "react-router-dom";
import { LecturesPage } from "./pages/LecturesPage";
import { LectureViewerPage } from "./pages/LectureViewerPage";
import { StudyguidesPage } from "./pages/StudyguidesPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { AppShell } from "./components/AppShell";
import { CommunityIcon } from "./lib/icons";

/** Top-level router. All routes are session-gated by the AppShell, which
 *  redirects anonymous visitors to claraity.app/login (the canonical
 *  login lives on the main Claraity domain — we share the session).
 *
 *  /lectures/new is a legacy path — project creation now lives as a
 *  sheet modal over /lectures. The redirect preserves any bookmarks
 *  by opening the modal automatically via ?new=1.
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
        <Route
          path="/lectures/new"
          element={<Navigate to="/lectures?new=1" replace />}
        />
        <Route path="/lectures/:id" element={<LectureViewerPage />} />

        {/* Stubbed destinations — see ComingSoonPage. */}
        <Route path="/studyguides" element={<StudyguidesPage />} />
        {/* /shared no longer has its own route — the sidebar "Shared with
            me" entry deep-links to /lectures?filter=shared, where the
            filter chip pre-selects that scope and LecturesPage renders
            an appropriate empty state until shared content lands. */}
        <Route
          path="/community"
          element={
            <ComingSoonPage
              title="Community"
              description="Public lectures and study guides shared by the wider Streamline community — browse, save, and learn from materials posted by other users."
              icon={<CommunityIcon className="h-7 w-7" />}
            />
          }
        />

        <Route path="*" element={<Navigate to="/lectures" replace />} />
      </Route>
    </Routes>
  );
}
