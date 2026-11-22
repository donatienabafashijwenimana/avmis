import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Collapse,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { Download, FilterAlt, FilterAltOff } from '@mui/icons-material';
import { apiRequest } from '../lib/api';
import ListToolbar from '../components/ListToolbar';

const dateValue = (value) => new Date(String(value || '').replace(' ', 'T')).getTime() || 0;
const displayDate = (value) => (value ? new Date(String(value).replace(' ', 'T')).toLocaleString() : '—');
const optionValues = (rows, field) => [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort();
const countBy = (rows, field, value) => rows.filter((row) => row[field] === value).length;
const uniqueCount = (rows, field) => new Set(rows.map((row) => row[field]).filter((value) => value !== null && value !== undefined)).size;
const matchesStatus = (value, selected) => !selected || (selected !== 'Not received' && value === selected);

const electionProcess = (election) => {
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

const reportCell = (value) => value === null || value === undefined || value === '' ? '—' : value;

export default function ReportsPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState('');
  const [election, setElection] = useState('');
  const [party, setParty] = useState('');
  const [applicationStatus, setApplicationStatus] = useState('');
  const [electionStatus, setElectionStatus] = useState('');
  const [process, setProcess] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('position-asc');
  const [reportTab, setReportTab] = useState(0);

  useEffect(() => {
    let active = true;
    const loadReport = () => {
      apiRequest('/reports.php')
        .then((response) => { if (active) { setReport(response); setError(''); } })
        .catch((requestError) => { if (active) setError(requestError.message || 'Report could not be loaded.'); })
        .finally(() => { if (active) setLoading(false); });
    };
    loadReport();
    const interval = window.setInterval(loadReport, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  const positions = useMemo(() => report?.positions || [], [report]);
  const applications = useMemo(() => report?.applications || [], [report]);
  const votes = useMemo(() => report?.votes || [], [report]);
  const elections = useMemo(() => report?.elections || [], [report]);

  const options = useMemo(() => ({
    positions: optionValues(positions, 'name'),
    elections: optionValues(elections, 'name'),
    parties: optionValues([...applications, ...votes], 'party'),
    electionStatuses: optionValues(elections, 'status'),
    processes: [...new Set(elections.map(electionProcess))].sort(),
  }), [applications, elections, positions, votes]);

  const query = useMemo(() => search.trim().toLowerCase(), [search]);
  const from = useMemo(() => dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : 0, [dateFrom]);
  const to = useMemo(() => dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : Number.POSITIVE_INFINITY, [dateTo]);

  const matchesText = useCallback((row) => !query || [
    row.position, row.election, row.candidate, row.party, row.status, row.applicationStatus,
  ].some((value) => String(value || '').toLowerCase().includes(query)), [query]);

  const matchesSelection = useCallback((row) => (
    (!position || row.position === position)
    && (!election || row.election === election)
    && (!party || row.party === party)
    && matchesText(row)
  ), [election, matchesText, party, position]);

  const filteredApplications = useMemo(() => applications.filter((row) => (
    matchesSelection(row)
    && matchesStatus(row.status, applicationStatus)
    && (!dateFrom || dateValue(row.submittedAt) >= from)
    && (!dateTo || dateValue(row.submittedAt) <= to)
  )), [applications, applicationStatus, dateFrom, dateTo, from, matchesSelection, to]);

  const filteredVotes = useMemo(() => votes.filter((row) => (
    matchesSelection(row)
    && matchesStatus(row.applicationStatus, applicationStatus)
    && (!dateFrom || dateValue(row.castAt) >= from)
    && (!dateTo || dateValue(row.castAt) <= to)
  )), [applicationStatus, dateFrom, dateTo, from, matchesSelection, to, votes]);

  const reportPositions = useMemo(() => {
    const rows = positions.filter((item) => {
      if (position && item.name !== position) return false;
      if (election && item.election !== election) return false;
      if (electionStatus && item.electionStatus !== electionStatus) return false;
      if (process && !item.electionId) return false;
      if (process && item.electionId) {
        const electionRow = elections.find((itemElection) => itemElection.id === item.electionId);
        if (!electionRow || electionProcess(electionRow) !== process) return false;
      }
      if (applicationStatus === 'Not received' && applications.some((row) => row.positionId === item.id)) return false;
      if (applicationStatus && applicationStatus !== 'Not received' && !applications.some((row) => row.positionId === item.id && row.status === applicationStatus)) return false;
      if (party && !applications.some((row) => row.positionId === item.id && row.party === party) && !votes.some((row) => row.positionId === item.id && row.party === party)) return false;
      if ((dateFrom || dateTo) && !filteredApplications.some((row) => row.positionId === item.id) && !filteredVotes.some((row) => row.positionId === item.id)) return false;
      if (!query) return true;
      return [item.name, item.election, item.category].some((value) => String(value || '').toLowerCase().includes(query))
        || filteredApplications.some((app) => app.positionId === item.id)
        || filteredVotes.some((vote) => vote.positionId === item.id);
    });
    return [...rows].sort((left, right) => {
      const comparison = left.name.localeCompare(right.name);
      return sort === 'position-desc' ? -comparison : comparison;
    });
  }, [applicationStatus, applications, dateFrom, dateTo, election, electionStatus, elections, filteredApplications, filteredVotes, party, position, positions, process, query, sort, votes]);

  const applicationReport = useMemo(() => reportPositions.map((item) => {
    const rows = filteredApplications.filter((row) => row.positionId === item.id);
    return {
      ...item,
      total: rows.length,
      pending: countBy(rows, 'status', 'Pending'),
      approved: countBy(rows, 'status', 'Approved'),
      rejected: countBy(rows, 'status', 'Rejected'),
    };
  }), [filteredApplications, reportPositions]);

  const candidateReport = useMemo(() => reportPositions.map((item) => {
    const rows = filteredApplications.filter((row) => row.positionId === item.id);
    return {
      ...item,
      total: uniqueCount(rows, 'candidateId'),
      pending: uniqueCount(rows.filter((row) => row.status === 'Pending'), 'candidateId'),
      approved: uniqueCount(rows.filter((row) => row.status === 'Approved'), 'candidateId'),
      rejected: uniqueCount(rows.filter((row) => row.status === 'Rejected'), 'candidateId'),
    };
  }), [filteredApplications, reportPositions]);

  const voteReport = useMemo(() => reportPositions.map((item) => {
    const rows = filteredVotes.filter((row) => row.positionId === item.id);
    return {
      ...item,
      total: rows.length,
      approved: countBy(rows, 'applicationStatus', 'Approved'),
      rejected: countBy(rows, 'applicationStatus', 'Rejected'),
      other: rows.filter((row) => !['Approved', 'Rejected'].includes(row.applicationStatus)).length,
    };
  }), [filteredVotes, reportPositions]);

  const partyReport = useMemo(() => reportPositions.map((item) => {
    const rows = filteredApplications.filter((row) => row.positionId === item.id && row.partyId !== null);
    return {
      ...item,
      total: uniqueCount(rows, 'partyId'),
      approved: uniqueCount(rows.filter((row) => row.status === 'Approved'), 'partyId'),
      rejected: uniqueCount(rows.filter((row) => row.status === 'Rejected'), 'partyId'),
      pending: uniqueCount(rows.filter((row) => row.status === 'Pending'), 'partyId'),
    };
  }), [filteredApplications, reportPositions]);

  const electionReport = useMemo(() => elections.filter((item) => {
    const processName = electionProcess(item);
    if (position && item.position !== position) return false;
    if (election && item.name !== election) return false;
    if (electionStatus && item.status !== electionStatus) return false;
    if (process && processName !== process) return false;
    if (query && ![item.name, item.position, item.status, processName].some((value) => String(value || '').toLowerCase().includes(query))) {
      const hasRelated = filteredApplications.some((row) => row.positionId === item.positionId)
        || filteredVotes.some((row) => row.positionId === item.positionId);
      if (!hasRelated) return false;
    }
    if (applicationStatus === 'Not received') {
      if (applications.some((row) => row.positionId === item.positionId)) return false;
    } else if ((party || applicationStatus || dateFrom || dateTo) && !filteredApplications.some((row) => row.positionId === item.positionId) && !filteredVotes.some((row) => row.positionId === item.positionId)) {
      return false;
    }
    return true;
  }).map((item) => ({
    ...item,
    process: electionProcess(item),
    applications: filteredApplications.filter((row) => row.positionId === item.positionId).length,
    approvedCandidates: uniqueCount(filteredApplications.filter((row) => row.positionId === item.positionId && row.status === 'Approved'), 'candidateId'),
    rejectedCandidates: uniqueCount(filteredApplications.filter((row) => row.positionId === item.positionId && row.status === 'Rejected'), 'candidateId'),
    votes: filteredVotes.filter((row) => row.positionId === item.positionId).length,
  })), [applicationStatus, applications, dateFrom, dateTo, election, electionStatus, elections, filteredApplications, filteredVotes, party, position, process, query]);

  const clearFilters = () => {
    setSearch(''); setPosition(''); setElection(''); setParty(''); setApplicationStatus('');
    setElectionStatus(''); setProcess(''); setDateFrom(''); setDateTo(''); setSort('position-asc');
  };

  const download = () => {
    const rows = [
      ['Applications by position'],
      ['Position', 'Election', 'Total applications', 'Received / pending', 'Approved', 'Rejected'],
      ...applicationReport.map((row) => [row.name, row.election, row.total, row.pending, row.approved, row.rejected]),
      [],
      ['Candidates by position'],
      ['Position', 'Election', 'Total candidates', 'Pending', 'Approved', 'Rejected'],
      ...candidateReport.map((row) => [row.name, row.election, row.total, row.pending, row.approved, row.rejected]),
      [],
      ['Votes by position'],
      ['Position', 'Election', 'Total votes', 'Approved candidate votes', 'Rejected candidate votes', 'Other votes'],
      ...voteReport.map((row) => [row.name, row.election, row.total, row.approved, row.rejected, row.other]),
      [],
      ['Political parties by position'],
      ['Position', 'Election', 'Total parties', 'Pending parties', 'Approved parties', 'Rejected parties'],
      ...partyReport.map((row) => [row.name, row.election, row.total, row.pending, row.approved, row.rejected]),
      [],
      ['Election and process'],
      ['Election', 'Position', 'Status', 'Process', 'Applications', 'Approved candidates', 'Rejected candidates', 'Votes', 'Results published'],
      ...electionReport.map((row) => [row.name, row.position, row.status, row.process, row.applications, row.approvedCandidates, row.rejectedCandidates, row.votes, row.resultsPublished ? 'Yes' : 'No']),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'election-process-report.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !report) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 300 }}><CircularProgress /></Box>;

  const filterFields = [
    ['Position', position, setPosition, options.positions],
    ['Election', election, setElection, options.elections],
    ['Political party', party, setParty, options.parties],
    ['Election status', electionStatus, setElectionStatus, options.electionStatuses],
    ['Process', process, setProcess, options.processes],
  ];

  return (
    <Box className="print-table-page">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Election Process Report</Typography>
          <Typography color="text.secondary">Applications, candidates, votes, political parties, and election progress by position.</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={filtersOpen ? <FilterAltOff /> : <FilterAlt />} onClick={() => setFiltersOpen((open) => !open)}>{filtersOpen ? 'Hide conditions' : 'Show conditions'}</Button>
          <Button variant="contained" startIcon={<Download />} onClick={download}>Download CSV</Button>
        </Box>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {report && <>
        <Collapse in={filtersOpen}>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Related report conditions</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' }, gap: 2, mb: 2 }}>
                {filterFields.map(([label, value, setter, values]) => (
                  <Box key={label} sx={{ minWidth: 0 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{label}</InputLabel>
                      <Select label={label} value={value} onChange={(event) => setter(event.target.value)}>
                        <MenuItem value="">All</MenuItem>
                        {values.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Box>
                ))}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
                <Box sx={{ minWidth: 0 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Application result</InputLabel>
                    <Select label="Application result" value={applicationStatus} onChange={(event) => setApplicationStatus(event.target.value)}>
                      <MenuItem value="">All</MenuItem><MenuItem value="Not received">Not received</MenuItem><MenuItem value="Pending">Received / pending</MenuItem><MenuItem value="Approved">Approved</MenuItem><MenuItem value="Rejected">Rejected</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
                <TextField fullWidth size="small" type="date" label="Submitted / vote from" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} InputLabelProps={{ shrink: true }} />
                <TextField fullWidth size="small" type="date" label="Submitted / vote to" value={dateTo} onChange={(event) => setDateTo(event.target.value)} InputLabelProps={{ shrink: true }} />
                <Button fullWidth variant="outlined" onClick={clearFilters} sx={{ height: 40 }}>Clear all conditions</Button>
              </Box>
            </CardContent>
          </Card>
        </Collapse>

        <ListToolbar
          search={search}
          onSearch={setSearch}
          searchLabel="Search report fields"
          sort={sort}
          onSort={setSort}
          sortOptions={[{ value: 'position-asc', label: 'Position (A–Z)' }, { value: 'position-desc', label: 'Position (Z–A)' }]}
          onPrint={() => window.print()}
        />

        <Box className="print-hide" sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={reportTab} onChange={(_, nextTab) => setReportTab(nextTab)} variant="scrollable" scrollButtons="auto" aria-label="Election report sections">
            <Tab label="Applications" />
            <Tab label="Candidates" />
            <Tab label="Votes" />
            <Tab label="Political parties" />
            <Tab label="Election process" />
          </Tabs>
        </Box>

        <Card className="report-tab-panel" sx={{ mb: 2, display: reportTab === 0 ? 'block' : 'none' }}><CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>1. Applications by position</Typography>
          <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Position</TableCell><TableCell>Election</TableCell><TableCell align="right">Total applications</TableCell><TableCell align="right">Received / pending</TableCell><TableCell align="right">Approved</TableCell><TableCell align="right">Rejected</TableCell></TableRow></TableHead><TableBody>
            {applicationReport.map((row) => <TableRow key={`applications-${row.id}`}><TableCell>{row.name}</TableCell><TableCell>{reportCell(row.election)}</TableCell><TableCell align="right">{row.total}</TableCell><TableCell align="right">{row.pending}</TableCell><TableCell align="right">{row.approved}</TableCell><TableCell align="right">{row.rejected}</TableCell></TableRow>)}
            {!applicationReport.length && <TableRow><TableCell colSpan={6} align="center">No application data matches the selected conditions.</TableCell></TableRow>}
          </TableBody></Table></TableContainer>
        </CardContent></Card>

        <Card className="report-tab-panel" sx={{ mb: 2, display: reportTab === 1 ? 'block' : 'none' }}><CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>2. Candidates per position</Typography>
          <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Position</TableCell><TableCell>Election</TableCell><TableCell align="right">Total candidates</TableCell><TableCell align="right">Pending</TableCell><TableCell align="right">Approved</TableCell><TableCell align="right">Rejected</TableCell></TableRow></TableHead><TableBody>
            {candidateReport.map((row) => <TableRow key={`candidates-${row.id}`}><TableCell>{row.name}</TableCell><TableCell>{reportCell(row.election)}</TableCell><TableCell align="right">{row.total}</TableCell><TableCell align="right">{row.pending}</TableCell><TableCell align="right">{row.approved}</TableCell><TableCell align="right">{row.rejected}</TableCell></TableRow>)}
            {!candidateReport.length && <TableRow><TableCell colSpan={6} align="center">No candidate data matches the selected conditions.</TableCell></TableRow>}
          </TableBody></Table></TableContainer>
        </CardContent></Card>

        <Card className="report-tab-panel" sx={{ mb: 2, display: reportTab === 2 ? 'block' : 'none' }}><CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>3. Votes per position</Typography>
          <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Position</TableCell><TableCell>Election</TableCell><TableCell align="right">Total votes</TableCell><TableCell align="right">Approved candidate votes</TableCell><TableCell align="right">Rejected candidate votes</TableCell><TableCell align="right">Other votes</TableCell></TableRow></TableHead><TableBody>
            {voteReport.map((row) => <TableRow key={`votes-${row.id}`}><TableCell>{row.name}</TableCell><TableCell>{reportCell(row.election)}</TableCell><TableCell align="right">{row.total}</TableCell><TableCell align="right">{row.approved}</TableCell><TableCell align="right">{row.rejected}</TableCell><TableCell align="right">{row.other}</TableCell></TableRow>)}
            {!voteReport.length && <TableRow><TableCell colSpan={6} align="center">No vote data matches the selected conditions.</TableCell></TableRow>}
          </TableBody></Table></TableContainer>
        </CardContent></Card>

        <Card className="report-tab-panel" sx={{ mb: 2, display: reportTab === 3 ? 'block' : 'none' }}><CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>4. Political parties per position</Typography>
          <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Position</TableCell><TableCell>Election</TableCell><TableCell align="right">Total parties</TableCell><TableCell align="right">Pending parties</TableCell><TableCell align="right">Approved parties</TableCell><TableCell align="right">Rejected parties</TableCell></TableRow></TableHead><TableBody>
            {partyReport.map((row) => <TableRow key={`parties-${row.id}`}><TableCell>{row.name}</TableCell><TableCell>{reportCell(row.election)}</TableCell><TableCell align="right">{row.total}</TableCell><TableCell align="right">{row.pending}</TableCell><TableCell align="right">{row.approved}</TableCell><TableCell align="right">{row.rejected}</TableCell></TableRow>)}
            {!partyReport.length && <TableRow><TableCell colSpan={6} align="center">No political-party data matches the selected conditions.</TableCell></TableRow>}
          </TableBody></Table></TableContainer>
        </CardContent></Card>

        <Card className="report-tab-panel" sx={{ mb: 2, display: reportTab === 4 ? 'block' : 'none' }}><CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>5. Election and process</Typography>
          <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Election</TableCell><TableCell>Position</TableCell><TableCell>Status</TableCell><TableCell>Process</TableCell><TableCell align="right">Applications</TableCell><TableCell align="right">Approved candidates</TableCell><TableCell align="right">Rejected candidates</TableCell><TableCell align="right">Votes</TableCell><TableCell>Results</TableCell></TableRow></TableHead><TableBody>
            {electionReport.map((row) => <TableRow key={`election-${row.id}`}><TableCell>{row.name}</TableCell><TableCell>{row.position}</TableCell><TableCell>{row.status}</TableCell><TableCell>{row.process}</TableCell><TableCell align="right">{row.applications}</TableCell><TableCell align="right">{row.approvedCandidates}</TableCell><TableCell align="right">{row.rejectedCandidates}</TableCell><TableCell align="right">{row.votes}</TableCell><TableCell>{row.resultsPublished ? `Published${row.resultsPublishedAt ? ` (${displayDate(row.resultsPublishedAt)})` : ''}` : 'Not published'}</TableCell></TableRow>)}
            {!electionReport.length && <TableRow><TableCell colSpan={9} align="center">No election data matches the selected conditions.</TableCell></TableRow>}
          </TableBody></Table></TableContainer>
        </CardContent></Card>
      </>}
    </Box>
  );
}
