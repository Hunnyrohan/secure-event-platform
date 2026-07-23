import { Routes, Route, Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Events from './pages/Events';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';

function NavBar() {
  const { user, logout } = useAuth();
  return (
    <nav className="flex items-center gap-4 border-b bg-white px-6 py-3 shadow-sm">
      <Link to="/" className="font-bold text-indigo-700">Secure Events</Link>
      <Link to="/events" className="text-sm text-gray-700">Events</Link>
      <div className="ml-auto flex items-center gap-3 text-sm">
        {user ? (
          <>
            <Link to="/profile">{user.fullName}</Link>
            {user.role === 'admin' && <Link to="/admin">Admin</Link>}
            <button type="button" onClick={logout} className="text-red-600">Logout</button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register" className="rounded bg-indigo-600 px-3 py-1 text-white">Sign up</Link>
          </>
        )}
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>
      <NavBar />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-4xl p-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/events" element={<Events />} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route
            path="/admin"
            element={<ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>}
          />
        </Routes>
      </main>
    </div>
  );
}
