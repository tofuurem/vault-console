import { Link, useLocation } from 'react-router-dom';

export default function NotFound() {
  const location = useLocation();

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative flex min-h-full items-center justify-center overflow-hidden bg-background-100 px-5 py-12 text-center"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-[-0.15em] select-none font-mono text-[9rem] font-semibold leading-none text-background-200 sm:text-[14rem]"
      >
        404
      </div>
      <section
        aria-labelledby="not-found-title"
        className="relative z-10 w-full max-w-lg rounded-xl border border-background-300 bg-background-50 p-6 shadow-xl shadow-overlay/10"
      >
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 text-primary-700">
          <i className="ri-compass-3-line text-xl" aria-hidden="true" />
        </div>
        <p className="mt-4 font-mono text-[9px] font-semibold uppercase tracking-[0.17em] text-primary-600">
          Route not found
        </p>
        <h1 id="not-found-title" className="mt-1 text-xl font-semibold text-foreground-900">
          This Vault Console page does not exist
        </h1>
        <p className="mt-2 break-all font-mono text-xs text-foreground-500">
          {location.pathname}
        </p>
        <p className="mt-4 text-sm leading-6 text-foreground-600">
          The link may be outdated. Return to the console to continue with your current tab session.
        </p>
        <Link
          to="/"
          className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary-500 px-4 text-sm font-medium text-background-50 hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        >
          <i className="ri-arrow-left-line" aria-hidden="true" />
          Return to Vault Console
        </Link>
      </section>
    </main>
  );
}
