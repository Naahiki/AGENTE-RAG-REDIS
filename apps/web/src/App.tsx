import { Routes, Route, NavLink } from "react-router-dom";
import Chat from "./pages/Chat";
import Admin from "./pages/Admin";

function MenuLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "px-4 py-2 rounded-lg transition-colors",
          "text-black hover:bg-red-50",
          isActive ? "bg-red-600 text-white hover:bg-red-600" : "",
        ].join(" ")
      }
      end
    >
      {label}
    </NavLink>
  );
}

export default function App() {
  return (
    <div className="min-h-dvh flex bg-base-100 text-black">
      {/* Sidebar */}
      <aside className="w-60 border-r border-base-300 bg-base-100">
        <div className="p-4 border-b border-base-300">
          <div className="text-2xl font-bold tracking-tight">Agent RAG</div>
          <div className="text-xs opacity-70">Navarra · RAG + Redis</div>
        </div>
        <nav className="p-3 flex flex-col gap-2">
          <MenuLink to="/" label="Chat" />
          <MenuLink to="/admin" label="Admin" />
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0">
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
    </div>
  );
}
