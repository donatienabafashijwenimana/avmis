import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Collapse,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { Analytics as AnalyticsIcon, FilterAlt, FilterAltOff } from '@mui/icons-material';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useReactToPrint } from 'react-to-print';
import { apiRequest } from '../lib/api';
import ListToolbar from '../components/ListToolbar';

const dateValue = (value) => new Date(String(value || '').replace(' ', 'T')).getTime() || 0;
const optionValues = (rows, field) => [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort();
const uniqueCount = (rows, field) => new Set(rows.map((row) => row[field]).filter((value) => value !== null && value !== undefined)).size;
const countBy = (rows, field, value) => rows.filter((row) => row[field] === value).length;

const processForElection = (election) => {
  const now = Date.now();
  const applicationStart = dateValue(election.applicationStartsAt);
  const applicationEnd = dateValue(election.applicationEndsAt);
  const votingStart = dateValue(election.votingStartsAt);
  const votingEnd = dateValue(election.votingEndsAt);
  if (election.resultsPublished) return 'Results published';
  if (election.status === 'Closed') return 'Election closed';
  if (election.status === 'Draft') return 'Draft';
  if (votingStart && now >= votingStart && (!votingEnd || now <= votingEnd)) return 'Voting in progress';
  if (applicationStart && now >= applicationStart && (!applicationEnd || now <= applicationEnd)) return 'Applications open';
  if (applicationStart && now < applicationStart) return 'Scheduled';
  if (votingStart && now < votingStart) return 'Scheduled for voting';
  return election.status || 'Unknown';
};

export default function AnalyticsPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState('');
  const [election, setElection] = useState('');
  const [party, setParty] = useState('');
  const [electionStatus, setElectionStatus] = useState('');
  const [applicationStatus, setApplicationStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const analyticsRef = useRef(null);
  const printAnalytics = useReactToPrint({
    contentRef: analyticsRef,
    documentTitle: 'election-analytics',
  });

  useEffect(() => {
    let active = true;
    const loadReport = () => {
      apiRequest('/reports.php')
        .then((response) => { if (active) { setReport(response); setError(''); } })
        .catch((requestError) => { if (active) setError(requestError.message || 'Analytics could not be loaded.'); })
        .finally(() => { if (active) setLoading(false); });
    };
    loadReport();
    const interval = window.setInterval(loadReport, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  const positions = useMemo(() => (Array.isArray(report?.positions) ? report.positions : []), [report]);
  const applications = useMemo(() => (Array.isArray(report?.applications) ? report.applications : []), [report]);
  const votes = useMemo(() => (Array.isArray(report?.votes) ? report.votes : []), [report]);
  const elections = useMemo(() => (Array.isArray(report?.elections) ? report.elections : []), [report]);
  const query = useMemo(() => search.trim().toLowerCase(), [search]);
  const from = useMemo(() => dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : 0, [dateFrom]);
  const to = useMemo(() => dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : Number.POSITIVE_INFINITY, [dateTo]);

  const options = useMemo(() => ({
    positions: optionValues(positions, 'name'),
    elections: optionValues(elections, 'name'),
    parties: optionValues([...applications, ...votes], 'party'),
    electionStatuses: optionValues(elections, 'status'),
  }), [applications, elections, positions, votes]);

  const matches = useCallback((row) => (
    (!position || row.position === position)
    && (!election || row.election === election)
    && (!party || row.party === party)
    && (!query || [row.position, row.election, row.candidate, row.party].some((value) => String(value || '').toLowerCase().includes(query)))
  ), [election, party, position, query]);
  const statusMatches = useCallback((value) => !applicationStatus || (applicationStatus !== 'Not received' && value === applicationStatus), [applicationStatus]);

  const filteredApplications = useMemo(() => applications.filter((row) => (
    matches(row)
    && statusMatches(row.status)
    && (!dateFrom || dateValue(row.submittedAt) >= from)
    && (!dateTo || dateValue(row.submittedAt) <= to)
  )), [applications, dateFrom, dateTo, from, matches, statusMatches, to]);

  const filteredVotes = useMemo(() => votes.filter((row) => (
    matches(row)
    && statusMatches(row.applicationStatus)
    && (!dateFrom || dateValue(row.castAt) >= from)
    && (!dateTo || dateValue(row.castAt) <= to)
  )), [dateFrom, dateTo, from, matches, statusMatches, to, votes]);

  const visiblePositions = useMemo(() => positions.filter((item) => {
    if (position && item.name !== position) return false;
    if (election && item.election !== election) return false;
    if (electionStatus && item.electionStatus !== electionStatus) return false;
    if (applicationStatus === 'Not received' && applications.some((row) => row.positionId === item.id)) return false;
    if (applicationStatus && applicationStatus !== 'Not received' && !applications.some((row) => row.positionId === item.id && row.status === applicationStatus)) return false;
    if (party && !filteredApplications.some((row) => row.positionId === item.id) && !filteredVotes.some((row) => row.positionId === item.id)) return false;
    return !query || [item.name, item.election, item.category].some((value) => String(value || '').toLowerCase().includes(query))
      || filteredApplications.some((row) => row.positionId === item.id)
      || filteredVotes.some((row) => row.positionId === item.id);
  }), [applicationStatus, applications, election, electionStatus, filteredApplications, filteredVotes, position, positions, query, party]);

  const positionMetrics = useMemo(() => visiblePositions.map((item) => {
    const positionApplications = filteredApplications.filter((row) => row.positionId === item.id);
    const positionVotes = filteredVotes.filter((row) => row.positionId === item.id);
    return {
      id: item.id,
      position: item.name,
      election: item.election || 'No election',
      applications: positionApplications.length,
      approvedApplications: countBy(positionApplications, 'status', 'Approved'),
      rejectedApplications: countBy(positionApplications, 'status', 'Rejected'),
      candidates: uniqueCount(positionApplications, 'candidateId'),
      approvedCandidates: uniqueCount(positionApplications.filter((row) => row.status === 'Approved'), 'candidateId'),
      rejectedCandidates: uniqueCount(positionApplications.filter((row) => row.status === 'Rejected'), 'candidateId'),
      votes: positionVotes.length,
      approvedVotes: countBy(positionVotes, 'applicationStatus', 'Approved'),
      rejectedVotes: countBy(positionVotes, 'applicationStatus', 'Rejected'),
      parties: uniqueCount(positionApplications, 'partyId'),
    };
  }), [filteredApplications, filteredVotes, visiblePositions]);

  const electionMetrics = useMemo(() => elections.filter((item) => {
    if (position && item.position !== position) return false;
    if (election && item.name !== election) return false;
    if (electionStatus && item.status !== electionStatus) return false;
    return true;
  }).map((item) => ({
    ...item,
    process: processForElection(item),
    applications: filteredApplications.filter((row) => row.positionId === item.positionId).length,
    candidates: uniqueCount(filteredApplications.filter((row) => row.positionId === item.positionId), 'candidateId'),
    votes: filteredVotes.filter((row) => row.positionId === item.positionId).length,
  })), [election, electionStatus, elections, filteredApplications, filteredVotes, position]);

  const processMetrics = useMemo(() => {
    const counts = electionMetrics.reduce((result, item) => {
      result[item.process] = (result[item.process] || 0) + 1;
      return result;
    }, {});
    return Object.entries(counts).map(([process, electionsCount]) => ({ process, elections: electionsCount }));
  }, [electionMetrics]);

  const applicationPartyMetrics = useMemo(() => positionMetrics.map((item) => ({
    position: item.position,
    applications: item.applications,
    parties: item.parties,
  })), [positionMetrics]);

  const partyVoteMetrics = useMemo(() => positionMetrics.map((item) => ({
    position: item.position,
    parties: item.parties,
    votes: item.votes,
  })), [positionMetrics]);

  const positionCandidateMetrics = useMemo(() => positionMetrics.map((item) => ({
    position: item.position,
    candidates: item.candidates,
    approvedCandidates: item.approvedCandidates,
    rejectedCandidates: item.rejectedCandidates,
  })), [positionMetrics]);

  const totals = useMemo(() => ({
    applications: filteredApplications.length,
    approvedApplications: countBy(filteredApplications, 'status', 'Approved'),
    rejectedApplications: countBy(filteredApplications, 'status', 'Rejected'),
    candidates: uniqueCount(filteredApplications, 'candidateId'),
    approvedCandidates: uniqueCount(filteredApplications.filter((row) => row.status === 'Approved'), 'candidateId'),
    rejectedCandidates: uniqueCount(filteredApplications.filter((row) => row.status === 'Rejected'), 'candidateId'),
    parties: uniqueCount(filteredApplications, 'partyId'),
    votes: filteredVotes.length,
    approvedVotes: countBy(filteredVotes, 'applicationStatus', 'Approved'),
    rejectedVotes: countBy(filteredVotes, 'applicationStatus', 'Rejected'),
    elections: electionMetrics.length,
  }), [electionMetrics.length, filteredApplications, filteredVotes]);

  const clearFilters = () => {
    setSearch(''); setPosition(''); setElection(''); setParty(''); setElectionStatus('');
    setApplicationStatus(''); setDateFrom(''); setDateTo('');
  };

  if (loading && !report) return <Box sx={{ minHeight: 300, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  if (!report) return <Alert severity="error">{error || 'Analytics are unavailable.'}</Alert>;

  const filterFields = [
    ['Position', position, setPosition, options.positions],
    ['Election', election, setElection, options.elections],
    ['Political party', party, setParty, options.parties],
    ['Election status', electionStatus, setElectionStatus, options.electionStatuses],
  ];

  return (
    <Box ref={analyticsRef} className="print-table-page">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box><Typography variant="h5" sx={{ fontWeight: 700 }}>Analytics</Typography><Typography color="text.secondary">Live analytics calculated from the election process report.</Typography></Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={filtersOpen ? <FilterAltOff /> : <FilterAlt />} onClick={() => setFiltersOpen((open) => !open)}>{filtersOpen ? 'Hide conditions' : 'Show conditions'}</Button>
          <Button className="print-hide" variant="text" startIcon={<AnalyticsIcon />} onClick={printAnalytics}>Print analytics</Button>
        </Box>
      </Box>
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
      <Collapse in={filtersOpen}>
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Analytics conditions</Typography>
            <Grid container spacing={2}>
              {filterFields.map(([label, value, setter, values]) => <Grid item xs={12} sm={6} md={3} key={label}><FormControl fullWidth size="small"><InputLabel>{label}</InputLabel><Select label={label} value={value} onChange={(event) => setter(event.target.value)}><MenuItem value="">All</MenuItem>{values.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}</Select></FormControl></Grid>)}
              <Grid item xs={12} sm={6} md={3}><FormControl fullWidth size="small"><InputLabel>Application result</InputLabel><Select label="Application result" value={applicationStatus} onChange={(event) => setApplicationStatus(event.target.value)}><MenuItem value="">All</MenuItem><MenuItem value="Not received">Not received</MenuItem><MenuItem value="Pending">Received / pending</MenuItem><MenuItem value="Approved">Approved</MenuItem><MenuItem value="Rejected">Rejected</MenuItem></Select></FormControl></Grid>
              <Grid item xs={12} sm={6} md={3}><TextField fullWidth size="small" type="date" label="From" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
              <Grid item xs={12} sm={6} md={3}><TextField fullWidth size="small" type="date" label="To" value={dateTo} onChange={(event) => setDateTo(event.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
              <Grid item xs={12} sm={6} md={3}><Button fullWidth variant="outlined" onClick={clearFilters} sx={{ height: 40 }}>Clear conditions</Button></Grid>
            </Grid>
          </CardContent>
        </Card>
      </Collapse>

      <ListToolbar search={search} onSearch={setSearch} searchLabel="Search analytics" onPrint={printAnalytics} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' }, gap: 2, mb: 3 }}>
        {[
          ['Applications', totals.applications],
          ['Approved candidates', totals.approvedCandidates],
          ['Rejected candidates', totals.rejectedCandidates],
          ['Political parties', totals.parties],
          ['Votes', totals.votes],
        ].map(([label, value]) => <Card key={label}><CardContent><Typography color="text.secondary">{label}</Typography><Typography variant="h4" sx={{ fontWeight: 700 }}>{value}</Typography></CardContent></Card>)}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
        <Card><CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Applications and parties</Typography>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={applicationPartyMetrics}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="position" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="applications" name="Applications" fill="#1976d2" />
              <Bar dataKey="parties" name="Parties" fill="#7c3aed" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent></Card>

        <Card><CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Parties and votes</Typography>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={partyVoteMetrics}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="position" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="parties" name="Parties" fill="#7c3aed" />
              <Bar dataKey="votes" name="Votes" fill="#2e7d32" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent></Card>

        <Card><CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Position and candidates</Typography>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={positionCandidateMetrics}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="position" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="candidates" name="Candidates" fill="#1976d2" />
              <Bar dataKey="approvedCandidates" name="Approved candidates" fill="#2e7d32" />
              <Bar dataKey="rejectedCandidates" name="Rejected candidates" fill="#d32f2f" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent></Card>

        <Card><CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Election and process</Typography>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={processMetrics}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="process" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="elections" name="Elections" fill="#ed6c02" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent></Card>
      </Box>
    </Box>
  );
}
