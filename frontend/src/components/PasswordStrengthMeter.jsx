/**
 * Client-side password strength meter. Mirrors the server policy in
 * backend/src/utils/password.js. The SERVER remains the authoritative gate;
 * this is UX feedback only.
 */
const RULES = [
  { label: '12+ characters', test: (p) => p.length >= 12 },
  { label: 'Uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'Lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'Digit', test: (p) => /[0-9]/.test(p) },
  { label: 'Symbol', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

const COLORS = ['bg-red-500', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-600'];

export default function PasswordStrengthMeter({ password }) {
  const passed = RULES.filter((r) => r.test(password || ''));
  const score = passed.length;
  return (
    <div className="mt-2">
      <div className="h-2 w-full rounded bg-gray-200">
        <div className={`h-2 rounded ${COLORS[score]}`} style={{ width: `${(score / 5) * 100}%` }} />
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
        {RULES.map((r) => (
          <li key={r.label} className={r.test(password || '') ? 'text-green-700' : 'text-gray-400'}>
            {r.test(password || '') ? '✓' : '○'} {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
