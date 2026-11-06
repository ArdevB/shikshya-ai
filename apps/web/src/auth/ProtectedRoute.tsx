import type { Role } from '@shikshya/shared';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageSpinner } from '@/components/feedback';
import { useAuth } from './AuthContext';
import { homePathFor } from './roles';

/**
 * Sends logged-out visitors to the login page and users with the wrong role to their own
 * home. This only decides what to display: the API enforces the actual permissions.
 */
export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  // Accounts with a temporary password must choose their own before doing anything else.
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }

  return <Outlet />;
}
