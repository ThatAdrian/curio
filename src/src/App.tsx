import { useState } from "react";
import { Routes, Route } from "react-router-dom";
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

export default function App() {
  const [customizing, setCustomizing] = useState(false);
  return (
    <>
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
        <Route path="/auth" element={<Auth />} />
      </Routes>
      <TabBar onCustomize={() => setCustomizing(true)} />
      <CustomizerSheet open={customizing} onClose={() => setCustomizing(false)} />
    </>
  );
}
