import { Component, ReactNode, useEffect, useState } from "react";
import { Routes, Route, useLocation, Link } from "react-router-dom";
import { TopBar, TabBar, CustomizerSheet } from "./components/Chrome";
import Profile from "./pages/Profile";
import ShelfPage from "./pages/Shelf";
import Discover from "./pages/Discover";
import Activity from "./pages/Activity";
import Settings from "./pages/Settings";
import MediaPage from "./pages/MediaPage";
import ClubsIndex, { ClubPage } from "./pages/Club";
import RoomsIndex, { RoomPage } from "./pages/Room";
import Auth from "./pages/Auth";
import Gifts from "./pages/Gifts";
import ImportPage from "./pages/ImportPage";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <main className="app">
          <div className="card pad" style={{ marginTop: 40, textAlign: "center" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}>Something fell off the shelf</h2>
            <p className="muted" style={{ margin: "8px 0 4px" }}>An unexpected error broke this view. Your data is fine.</p>
            <p className="mono faint" style={{ fontSize: 10, marginBottom: 14 }}>{String(this.state.error)}</p>
            <button className="btn primary" onClick={() => location.reload()}>Pick it back up</button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

function NotFound() {
  return (
    <main className="app">
      <div className="card pad" style={{ marginTop: 40, textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26 }}>404 — not on any shelf</h2>
        <p className="muted" style={{ margin: "8px 0 16px" }}>This page was either lent out and never returned, or it never existed.</p>
        <Link className="btn primary" to="/">Back to your profile</Link>
      </div>
    </main>
  );
}

const TITLES: Record<string, string> = {
  "": "profile", u: "profile", shelf: "the shelf", discover: "discover", activity: "activity",
  settings: "settings", m: "media", clubs: "clubs", c: "club", rooms: "rooms", room: "living room",
  auth: "sign in", gifts: "gifts", import: "import",
};
function TitleSync() {
  const loc = useLocation();
  useEffect(() => {
    const seg = loc.pathname.split("/")[1] ?? "";
    document.title = `curio — ${TITLES[seg] ?? "your shelves"}`;
  }, [loc.pathname]);
  return null;
}

export default function App() {
  const [customizing, setCustomizing] = useState(false);
  return (
    <ErrorBoundary>
      <TitleSync />
      <div className="app" style={{ paddingBottom: 0 }}>
        <TopBar />
      </div>
      <Routes>
        <Route path="/" element={<Profile />} />
        <Route path="/u/:username" element={<Profile />} />
        <Route path="/shelf" element={<ShelfPage />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/m/:id" element={<MediaPage />} />
        <Route path="/clubs" element={<ClubsIndex />} />
        <Route path="/c/:slug" element={<ClubPage />} />
        <Route path="/rooms" element={<RoomsIndex />} />
        <Route path="/room/:id" element={<RoomPage />} />
        <Route path="/gifts" element={<Gifts />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <TabBar onCustomize={() => setCustomizing(true)} />
      <CustomizerSheet open={customizing} onClose={() => setCustomizing(false)} />
    </ErrorBoundary>
  );
}
