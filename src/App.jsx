import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { ThemeProvider } from './stores/themeStore';
import Layout from './components/layout/AppLayout';
import LoginPage from './pages/Login';
import ResetPasswordPage from './pages/ResetPassword';
import DashboardPage from './pages/Dashboard';
import CandidatesPage from './pages/Candidates';
import VotersPage from './pages/Voters';
import UsersPage from './pages/Users';
import VotingPage from './pages/Voting';
import ResultsPage from './pages/Results';
import ProfilePage from './pages/Profile';
import PositionsPage from './pages/Positions';
import AnalyticsPage from './pages/Analytics';
import ApplicationsPage from './pages/Applications';
import ElectionsPage from './pages/Elections';
import PollingDistrictsPage from './pages/PollingDistricts';
import ReportsPage from './pages/Reports';
import PoliticalPartiesPage from './pages/PoliticalParties';
import PartyRegistrationPage from './pages/PartyRegistration';
import CandidateApplicationsPage from './pages/CandidateApplications';
import AvailablePositionsPage from './pages/AvailablePositions';
import PublicationResultsPage from './pages/PublicationResults';
import { useAuthStore } from './stores/authStore';
import './styles/main.scss';
import 'react-toastify/dist/ReactToastify.css';

function ResultsRoute() {
  const role = useAuthStore((state) => state.currentUser?.role);
  return role === 'admin' ? <ResultsPage /> : <PublicationResultsPage />;
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ToastContainer position="top-right" autoClose={3500} newestOnTop theme="colored" />
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/party-registration" element={<PartyRegistrationPage />} />
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/candidates" element={<CandidatesPage />} />
            <Route path="/positions" element={<PositionsPage />} />
            <Route path="/voters" element={<VotersPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/voting" element={<VotingPage />} />
            <Route path="/candidate" element={<Navigate to="/candidate/positions" replace />} />
            <Route path="/candidate/positions" element={<AvailablePositionsPage />} />
            <Route path="/candidate/positions/apply/:electionId" element={<AvailablePositionsPage />} />
            <Route path="/candidate/applications" element={<CandidateApplicationsPage />} />
            <Route path="/candidate/results" element={<PublicationResultsPage />} />
            <Route path="/results" element={<ResultsRoute />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/applications" element={<ApplicationsPage />} />
            <Route path="/election-records" element={<Navigate to="/reports" replace />} />
            <Route path="/elections" element={<ElectionsPage />} />
            <Route path="/polling-districts" element={<PollingDistrictsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/political-parties" element={<PoliticalPartiesPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
