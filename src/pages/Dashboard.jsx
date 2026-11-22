import { Alert, Box, CircularProgress, Typography } from '@mui/material';
import { TrendingUp, People, HowToVote, EmojiEvents } from '@mui/icons-material';
import { useDataStore } from '../stores/dataStore';
import StatCard from '../components/charts/StatCard';

export default function DashboardPage() {
  const analytics = useDataStore((state) => state.analytics);
  const loading = useDataStore((state) => state.loading);

  if (loading && !analytics) {
    return <Box sx={{ minHeight: 320, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  }

  if (!analytics) {
    return <Alert severity="warning">Analytics are unavailable. They will load automatically when the PHP API and database are running.</Alert>;
  }

  const { summary } = analytics;
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>Election Dashboard</Typography>
          <Typography color="text.secondary">Live aggregates calculated from recorded database votes.</Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 2, mb: 3 }}>
        <StatCard label="Candidates" value={analytics.candidates.length} icon={<EmojiEvents />} gradient="linear-gradient(135deg, #7c3aed, #c084fc)" />
        <StatCard label="Registered voters" value={summary.totalVoters} icon={<People />} gradient="linear-gradient(135deg, #4c1d95, #7c3aed)" />
        <StatCard label="Votes cast" value={summary.totalVotes} icon={<HowToVote />} gradient="linear-gradient(135deg, #a855f7, #ddd6fe)" />
        <StatCard label="Not voted" value={summary.notVotedVoters} icon={<People />} gradient="linear-gradient(135deg, #ef6c00, #ffb74d)" />
        <StatCard label="Voter turnout" value={`${summary.turnout}%`} icon={<TrendingUp />} gradient="linear-gradient(135deg, #558b2f, #9ccc65)" />
      </Box>

      <Typography color="text.secondary" sx={{ mt: 3 }}>
        Detailed charts and graphs are available on the Analytics page.
      </Typography>
    </Box>
  );
}
