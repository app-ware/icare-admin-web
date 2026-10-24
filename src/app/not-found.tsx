import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>Page not found</h1>
      <p>This destination isn’t part of the portal.</p>
      <Link className="button primary" href="/">
        Return to overview
      </Link>
    </div>
  );
}
