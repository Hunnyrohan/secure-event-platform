import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="space-y-4 text-center">
      <h1 className="text-3xl font-bold text-indigo-800">Secure Event Management Platform</h1>
      <p className="text-gray-600">
        Discover events, book your seat, and manage everything from one secure account
        protected by multi-factor authentication.
      </p>
      <Link to="/events" className="inline-block rounded bg-indigo-600 px-5 py-2 text-white">
        Browse events
      </Link>
    </div>
  );
}
