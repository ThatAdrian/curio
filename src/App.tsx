import { Routes, Route, Link } from "react-router-dom";
import Profile from "./pages/Profile";
import Shelf from "./pages/Shelf";
import Discover from "./pages/Discover";
import Activity from "./pages/Activity";
import Settings from "./pages/Settings";
import MediaPage from "./pages/MediaPage";
import Club from "./pages/Club";
import Room from "./pages/Room";
import Auth from "./pages/Auth";

export default function App() {
  return (
    <div>
      <nav style={{ display: "flex", gap: 12, padding: 12 }}>
        <Link to="/">Profile</Link>
        <Link to="/shelf">Shelf</Link>
        <Link to="/discover">Discover</Link>
        <Link to="/activity">Activity</Link>
        <Link to="/settings">Settings</Link>
        <Link to="/auth">Sign in</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Profile />} />
        <Route path="/u/:username" element={<Profile />} />
        <Route path="/shelf" element={<Shelf />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/m/:id" element={<MediaPage />} />
        <Route path="/c/:slug" element={<Club />} />
        <Route path="/room/:id" element={<Room />} />
        <Route path="/auth" element={<Auth />} />
      </Routes>
    </div>
  );
}
