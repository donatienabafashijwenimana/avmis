import { useEffect, useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Box } from '@mui/material';
import AppHeader from './AppHeader';
import AppSidebar from './AppSidebar';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const currentUser = useAuthStore((s) => s.currentUser);
  const loadData = useDataStore((s) => s.loadData);
  const elections = useDataStore((s) => s.elections);
  const location = useLocation();

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser, loadData]);

  useEffect(() => {
    if (!currentUser) return undefined;
    const interval = window.setInterval(() => {
      loadData();
    }, 30000);
    return () => window.clearInterval(interval);
  }, [currentUser, loadData]);

  useEffect(() => {
    if (!currentUser || !elections.length) return undefined;

    const nextDeadline = elections
      .filter((election) => election.status !== 'Closed' && election.votingEndsAt)
      .map((election) => new Date(election.votingEndsAt.replace(' ', 'T')).getTime())
      .filter((deadline) => Number.isFinite(deadline))
      .sort((first, second) => first - second)[0];

    if (!nextDeadline) return undefined;

    const timer = window.setTimeout(
      () => loadData(),
      Math.max(100, nextDeadline - Date.now() + 50)
    );
    return () => window.clearTimeout(timer);
  }, [currentUser, elections, loadData]);

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  const role = String(currentUser.role || '').toLowerCase();

  const adminOnlyPaths = [
    '/dashboard', '/positions', '/applications', '/candidates', '/voters', '/users',
    '/analytics', '/election-records', '/elections', '/polling-districts', '/political-parties', '/reports',
  ];
  if (role === 'voter' && adminOnlyPaths.includes(location.pathname)) {
    return <Navigate to="/voting" replace />;
  }

  if (role === 'admin' && location.pathname === '/voting') {
    return <Navigate to="/dashboard" replace />;
  }

  const isCandidatePortalRoute = location.pathname === '/candidate' || location.pathname.startsWith('/candidate/');
  if (role !== 'candidate' && isCandidatePortalRoute) {
    return <Navigate to={role === 'admin' ? '/dashboard' : '/voting'} replace />;
  }

  if (role === 'candidate' && !['/candidate', '/candidate/applications', '/candidate/results', '/profile'].includes(location.pathname)
    && !location.pathname.startsWith('/candidate/positions')) {
    return <Navigate to="/candidate/positions" replace />;
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Box
        sx={{
          flex: 1,
          ml: { xs: 0, md: '260px' },
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <AppHeader onMenuToggle={() => setSidebarOpen(true)} />
        <Box
          component="main"
          sx={{
            flex: 1,
            mt: '64px',
            p: { xs: 2, sm: 3 },
            bgcolor: (theme) =>
              theme.palette.mode === 'dark' ? '#0b0f0c' : '#f7faf7',
            minHeight: 'calc(100vh - 64px)',
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
