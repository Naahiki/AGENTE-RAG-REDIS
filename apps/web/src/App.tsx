import { Routes, Route, Link } from "react-router-dom";
import Chat from "./pages/Chat";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <nav style={{ padding: 12, borderBottom: "1px solid #eee", display: "flex", gap: 12 }}>
        <Link to="/">Chat</Link>
        <Link to="/admin">Admin</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Chat />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </div>
  );
}
