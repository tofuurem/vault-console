import { Outlet } from 'react-router-dom';

import ApplicationErrorBoundary from '@/application/diagnostics/ApplicationErrorBoundary';

export default function ApplicationRouteBoundary() {
  return (
    <ApplicationErrorBoundary>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Outlet />
    </ApplicationErrorBoundary>
  );
}
