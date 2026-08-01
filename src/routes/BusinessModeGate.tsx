import { Navigate, Outlet } from 'react-router-dom';
import { Loader } from '../components/common/Loader';
import { useAuth } from '../context/AuthContext';
import { useBusinessMode } from '../context/BusinessModeContext';

export function BusinessModeGate() {
  const { user } = useAuth();
  const { configured, loading } = useBusinessMode();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <Loader />
      </div>
    );
  }

  if (!configured && user?.role === 'owner') {
    return <Navigate to="/business-setup" replace />;
  }

  return <Outlet />;
}
