import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LOGIN_PATHS = {
  superAdmin: '/login/super-admin',
  schoolAdmin: '/login/school',
  distributor: '/login/distributor',
  superDistributor: '/login/super-distributor',
};

// Mirrors the prototype's requireAuth(role): redirect to login if not
// logged in, or if logged in as the wrong role.
export default function ProtectedRoute({ children, role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to={LOGIN_PATHS[role] || '/login/school'} replace />;
  if (role && user.role !== role) return <Navigate to={LOGIN_PATHS[role] || '/login/school'} replace />;
  return children;
}
