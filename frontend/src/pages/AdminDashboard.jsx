import { useEffect, useState } from 'react';
import client from '../api/client';

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);

  const load = () => {
    client.get('/admin/users').then((r) => setUsers(r.data.users)).catch(() => {});
    client.get('/admin/audit-logs?limit=25').then((r) => setLogs(r.data.logs)).catch(() => {});
  };
  useEffect(load, []);

  const suspend = async (id) => { await client.post(`/admin/users/${id}/suspend`); load(); };
  const setRole = async (id, role) => { await client.patch(`/admin/users/${id}/role`, { role }); load(); };

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-3 text-2xl font-semibold">Users</h1>
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-left">
              <tr><th className="p-2">Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="p-2">{u.fullName}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>{u.status}</td>
                  <td className="space-x-2 py-1">
                    <select defaultValue={u.role} onChange={(e) => setRole(u.id, e.target.value)}
                      className="rounded border text-xs">
                      <option value="user">user</option>
                      <option value="organizer">organizer</option>
                      <option value="admin">admin</option>
                    </select>
                    <button type="button" onClick={() => suspend(u.id)} className="text-xs text-red-600">
                      Suspend
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Recent security events</h2>
        <ul className="space-y-1 text-xs">
          {logs.map((l) => (
            <li key={l.id} className={`rounded p-2 ${l.outcome === 'alert' ? 'bg-red-50' : 'bg-white'} border`}>
              <span className="font-mono">{new Date(l.created_at).toLocaleString()}</span>
              {' · '}{l.action}{' · '}{l.outcome}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
