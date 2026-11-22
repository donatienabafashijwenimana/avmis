import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material';
import { Add, Close, Edit, Lock, LockOpen } from '@mui/icons-material';
import { useDataStore } from '../stores/dataStore';
import { apiRequest } from '../lib/api';
import { Publish } from '@mui/icons-material';
import { toast } from 'react-toastify';
import TableActions from '../components/TableActions';
import ListToolbar from '../components/ListToolbar';

const blank = {
  name: '', description: '', positionId: '', status: 'Draft',
  applicationStatus: 'Automatic',
  votingAccess: 'Automatic',
  applicationStartsAt: '', applicationEndsAt: '', votingStartsAt: '', votingEndsAt: '',
};
const dateInput = (value) => (value ? value.replace(' ', 'T').slice(0, 16) : '');
const dateTimeLocalNow = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
};
const deadlineReached = (election) => (
  election.votingEndsAt && new Date(election.votingEndsAt.replace(' ', 'T')).getTime() <= Date.now()
);

export default function ElectionsPage() {
  const elections = useDataStore((state) => state.elections);
  const dataError = useDataStore((state) => state.error);
  const positions = useDataStore((state) => state.positions);
  const candidates = useDataStore((state) => state.candidates);
  const addElection = useDataStore((state) => state.addElection);
  const updateElection = useDataStore((state) => state.updateElection);
  const closeElection = useDataStore((state) => state.closeElection);
  const reopenElection = useDataStore((state) => state.reopenElection);
  const publishElection = useDataStore((state) => state.publishElection);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [applications, setApplications] = useState([]);
  const [reopening, setReopening] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('name-asc');

  useEffect(() => {
    const loadApplications = () => apiRequest('/applications.php')
      .then((response) => setApplications(response.applications || []))
      .catch((requestError) => toast.error(requestError.message || 'Candidate applications could not be loaded.'));
    loadApplications();
    const interval = window.setInterval(loadApplications, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const openForm = (election = null) => {
    setEditing(election);
    setForm(election ? {
      name: election.name, description: election.description || '', positionId: election.positionId,
      status: election.status, applicationStatus: election.applicationStatus || 'Automatic', votingAccess: election.votingAccess || 'Automatic', applicationStartsAt: dateInput(election.applicationStartsAt),
      applicationEndsAt: dateInput(election.applicationEndsAt), votingStartsAt: dateInput(election.votingStartsAt),
      votingEndsAt: dateInput(election.votingEndsAt),
    } : blank);
    setError('');
    setFieldErrors({});
    setOpen(true);
  };

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors({});
    setError('');
  };

  const completedApplicationKeys = useMemo(
    () => new Set(
      applications
        .filter((application) => application.status === 'Approved')
        .map((application) => `${application.positionId}:${application.candidateId}`)
    ),
    [applications]
  );

  const candidatesForPosition = (positionId) => candidates.filter((candidate) => (
    candidate.status !== 'Inactive'
      && completedApplicationKeys.has(`${positionId}:${candidate.id}`)
  ));

  const validateTimeline = () => {
    const nextErrors = {};
    const applicationStart = new Date(form.applicationStartsAt).getTime();
    const applicationEnd = new Date(form.applicationEndsAt).getTime();
    const votingStart = new Date(form.votingStartsAt).getTime();
    const votingEnd = new Date(form.votingEndsAt).getTime();

    if (!form.applicationStartsAt) nextErrors.applicationStartsAt = 'Application start date is required.';
    if (!form.applicationEndsAt) nextErrors.applicationEndsAt = 'Application end date is required.';
    if (!form.votingStartsAt) nextErrors.votingStartsAt = 'Voting start date is required.';
    if (!form.votingEndsAt) nextErrors.votingEndsAt = 'Voting end date is required.';
    if (form.applicationStartsAt && form.applicationEndsAt && applicationEnd <= applicationStart) {
      nextErrors.applicationEndsAt = 'Must be greater than the application start date.';
    }
    if (form.applicationEndsAt && form.votingStartsAt && votingStart <= applicationEnd) {
      nextErrors.votingStartsAt = 'Must be greater than the application end date.';
    }
    if (form.votingStartsAt && form.votingEndsAt && votingEnd <= votingStart) {
      nextErrors.votingEndsAt = 'Must be greater than the voting start date.';
    }
    if (form.votingAccess === 'Open' && form.votingStartsAt && votingStart > Date.now()) {
      nextErrors.votingAccess = 'Voting cannot be opened before the voting start date.';
    }
    const votingOpenNow = form.votingStartsAt && form.votingEndsAt
      && votingStart <= Date.now() && votingEnd > Date.now();
    if (!nextErrors.votingAccess
      && (form.votingAccess === 'Open' || (form.votingAccess === 'Automatic' && votingOpenNow))
      && candidatesForPosition(form.positionId).length < 1) {
      nextErrors.votingAccess = 'At least one approved active candidate is required before voting can open.';
    }
    return nextErrors;
  };

  const save = async () => {
    const nextErrors = validateTimeline();
    if (!form.name.trim()) nextErrors.name = 'Election name is required.';
    if (!form.positionId) nextErrors.positionId = 'Electoral position is required.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError('');
      return;
    }
    try {
      if (editing) await updateElection(editing.id, form);
      else await addElection(form);
      setOpen(false);
    } catch (requestError) {
      setError(requestError.message || 'Election could not be saved.');
    }
  };
  const publish = async (election) => {
    if (!Number(election.voteCount)) {
      toast.error('Results cannot be published until at least one vote has been recorded.');
      return;
    }
    if (!window.confirm(`Publish the results for ${election.name}? Candidates will be able to view them.`)) return;
    try {
      await publishElection(election.id);
      toast.success('Election results published.');
    } catch (requestError) {
      toast.error(requestError.message || 'Results could not be published.');
    }
  };
  const close = async (election) => {
    if (!window.confirm(`Close ${election.name}? Voting will stop and the election can then be published.`)) return;
    try {
      await closeElection(election.id);
      toast.success('Election closed. You can now publish its results.');
    } catch (requestError) {
      toast.error(requestError.message || 'Election could not be closed.');
    }
  };
  const reopen = async (election) => {
    if (!window.confirm(`Reopen ${election.name} immediately for voting?`)) return;
    setReopening(true);
    try {
      await reopenElection(election.id);
      toast.success('Election reopened for voting.');
    } catch (requestError) {
      toast.error(requestError.message || 'Election could not be reopened.');
    } finally {
      setReopening(false);
    }
  };

  const visibleElections = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = elections.filter((election) => (
      (!query || [election.name, election.position, election.description].some((value) => String(value || '').toLowerCase().includes(query)))
      && (!statusFilter || election.status === statusFilter)
    ));
    return rows.sort((left, right) => {
      const [field, direction] = sort.split('-');
      const leftValue = field === 'votes' ? Number(left.voteCount || 0) : left[field] || '';
      const rightValue = field === 'votes' ? Number(right.voteCount || 0) : right[field] || '';
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number' ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue));
      return direction === 'desc' ? -comparison : comparison;
    });
  }, [elections, search, sort, statusFilter]);
  const electionStatuses = [...new Set(elections.map((election) => election.status).filter(Boolean))].sort();
  const safePage = Math.min(page, Math.max(0, Math.ceil(visibleElections.length / rowsPerPage) - 1));
  const paginatedElections = visibleElections.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);

  return (
    <Box className="print-table-page">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2, flexWrap: 'wrap' }}>
        <Box><Typography variant="h5" sx={{ fontWeight: 700 }}>Election Management</Typography><Typography color="text.secondary">Create, schedule, and close election events using application and voting access.</Typography></Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => openForm()}>Create Election</Button>
      </Box>
      {dataError && <Alert severity="error" sx={{ mb: 2 }}>Elections could not be loaded: {dataError}. Start MySQL and run <code>php api/seed.php</code> if the database schema needs the latest migration.</Alert>}
      <Card><CardContent><ListToolbar search={search} onSearch={(value) => { setSearch(value); setPage(0); }} searchLabel="Search elections" filter={statusFilter} onFilter={(value) => { setStatusFilter(value); setPage(0); }} filterLabel="Status" filterOptions={[{ value: '', label: 'All statuses' }, ...electionStatuses.map((value) => ({ value, label: value }))]} sort={sort} onSort={(value) => { setSort(value); setPage(0); }} sortOptions={[{ value: 'name-asc', label: 'Name (A–Z)' }, { value: 'name-desc', label: 'Name (Z–A)' }, { value: 'status-asc', label: 'Status' }, { value: 'votes-desc', label: 'Most votes' }]} onPrint={() => window.print()} /><TableContainer sx={{ width: '100%', overflowX: 'hidden' }}><Table sx={{ width: '100%', tableLayout: 'fixed', '& .MuiTableCell-root': { px: 1, py: 1, overflowWrap: 'anywhere' } }}><TableHead><TableRow>
        <TableCell sx={{ width: '16%' }}>Election</TableCell><TableCell sx={{ width: '9%' }}>Position</TableCell><TableCell sx={{ width: '16%' }}>Application dates</TableCell><TableCell sx={{ width: '16%' }}>Voting dates</TableCell><TableCell sx={{ width: '14%' }}>Access</TableCell><TableCell sx={{ width: '8%' }}>Voters</TableCell><TableCell sx={{ width: '12%' }}>Candidates</TableCell><TableCell align="right" className="print-hide" sx={{ width: '9%' }}>Actions</TableCell>
      </TableRow></TableHead><TableBody className="screen-table-body">
        {paginatedElections.map((election) => {
          const lockedByDeadline = deadlineReached(election);
          const completedCandidateCount = candidatesForPosition(election.positionId).length;
          return (
            <TableRow key={election.id} hover>
              <TableCell sx={{ verticalAlign: 'top' }}><Typography fontWeight={600}>{election.name}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{election.description}</Typography></TableCell>
              <TableCell sx={{ verticalAlign: 'top' }}>{election.position}</TableCell>
              <TableCell sx={{ verticalAlign: 'top' }}>{election.applicationStartsAt || 'Immediately'} – {election.applicationEndsAt || 'No deadline'}</TableCell>
              <TableCell sx={{ verticalAlign: 'top' }}>{election.votingStartsAt || 'Immediately'} – {election.votingEndsAt || 'No deadline'}</TableCell>
              <TableCell sx={{ verticalAlign: 'top' }}>{election.resultsPublished ? <Chip size="small" label="Results published" color="info" /> : <>{election.status !== 'Open' && <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}><Chip size="small" label={election.status} color={election.status === 'Closed' ? 'default' : 'warning'} /></Box>}{election.status === 'Open' && <><Typography variant="caption" display="block" color="text.secondary">Applications: {election.applicationStatus || 'Automatic'}</Typography><Typography variant="caption" display="block" color="text.secondary">Voting: {election.votingAccess || 'Automatic'}</Typography></>}</>}</TableCell>
              <TableCell sx={{ verticalAlign: 'top' }}>{election.voteCount}</TableCell>
              <TableCell sx={{ verticalAlign: 'top' }}>{completedCandidateCount} completed candidate{completedCandidateCount === 1 ? '' : 's'}</TableCell>
              <TableCell align="right" className="print-hide">
                <TableActions actions={[
                  { key: 'edit', label: election.resultsPublished ? 'Edit disabled: results published' : election.status === 'Closed' ? 'Edit disabled: election is closed' : 'Edit election', icon: <Edit fontSize="small" />, show: election.status !== 'Closed' && !lockedByDeadline, disabled: election.resultsPublished, onClick: () => openForm(election) },
                  { key: 'close', label: 'Close election before publishing results', icon: <Lock fontSize="small" />, color: 'warning', show: !election.resultsPublished && election.status !== 'Closed', onClick: () => close(election) },
                  { key: 'reopen', label: 'Reopen election immediately for voting', icon: <LockOpen fontSize="small" />, color: 'success', show: !election.resultsPublished && election.status === 'Closed', disabled: reopening, onClick: () => reopen(election) },
                  { key: 'publish', label: election.status !== 'Closed' ? 'Close election before publishing results' : !Number(election.voteCount) ? 'Cannot publish: no votes recorded' : 'Publish results', icon: <Publish fontSize="small" />, color: 'primary', show: !election.resultsPublished, disabled: election.status !== 'Closed' || !Number(election.voteCount), onClick: () => publish(election) },
                ]} />
              </TableCell>
            </TableRow>
          );
        })}
        {!visibleElections.length && !dataError && <TableRow><TableCell colSpan={8} align="center">{elections.length ? 'No elections match the current filters.' : 'No elections have been created.'}</TableCell></TableRow>}
      </TableBody><TableBody className="print-table-body">
        {visibleElections.map((election) => {
          const completedCandidateCount = candidatesForPosition(election.positionId).length;
          return <TableRow key={election.id}>
            <TableCell><Typography fontWeight={600}>{election.name}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{election.description}</Typography></TableCell>
            <TableCell>{election.position}</TableCell>
            <TableCell>{election.applicationStartsAt || 'Immediately'} – {election.applicationEndsAt || 'No deadline'}</TableCell>
            <TableCell>{election.votingStartsAt || 'Immediately'} – {election.votingEndsAt || 'No deadline'}</TableCell>
            <TableCell>{election.resultsPublished ? 'Results published' : `${election.status}; Applications: ${election.applicationStatus || 'Automatic'}; Voting: ${election.votingAccess || 'Automatic'}`}</TableCell>
            <TableCell>{election.voteCount}</TableCell>
            <TableCell>{completedCandidateCount} completed candidate{completedCandidateCount === 1 ? '' : 's'}</TableCell>
          </TableRow>;
        })}
        {!visibleElections.length && !dataError && <TableRow><TableCell colSpan={7} align="center">{elections.length ? 'No elections match the current filters.' : 'No elections have been created.'}</TableCell></TableRow>}
      </TableBody></Table></TableContainer>{visibleElections.length > 0 && <TablePagination component="div" count={visibleElections.length} page={safePage} onPageChange={(_, nextPage) => setPage(nextPage)} rowsPerPage={rowsPerPage} onRowsPerPageChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[5, 10, 25]} />}</CardContent></Card>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'Update Election' : 'Create Election'}<IconButton onClick={() => setOpen(false)} sx={{ float: 'right' }}><Close /></IconButton></DialogTitle>
        <DialogContent dividers>{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField required fullWidth label="Election name" inputProps={{ maxLength: 150 }} value={form.name} onChange={(e) => updateField('name', e.target.value)} error={!!fieldErrors.name} helperText={fieldErrors.name} sx={{ mb: 2, mt: 1 }} />
          <TextField required fullWidth multiline minRows={2} label="Description" inputProps={{ maxLength: 2000 }} value={form.description} onChange={(e) => updateField('description', e.target.value)} sx={{ mb: 2 }} />
          <TextField required select fullWidth label="Electoral position" value={form.positionId} onChange={(e) => updateField('positionId', e.target.value)} error={!!fieldErrors.positionId} helperText={fieldErrors.positionId} sx={{ mb: 2 }}>
            {positions.map((position) => <MenuItem key={position.id} value={position.id}>{position.name}</MenuItem>)}
          </TextField>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Application dates</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}><TextField required type="datetime-local" label="Start at" inputProps={{ min: editing?.applicationStartsAt && new Date(editing.applicationStartsAt.replace(' ', 'T')).getTime() < Date.now() ? dateInput(editing.applicationStartsAt) : dateTimeLocalNow() }} InputLabelProps={{ shrink: true }} value={form.applicationStartsAt} onChange={(e) => updateField('applicationStartsAt', e.target.value)} error={!!fieldErrors.applicationStartsAt} helperText={fieldErrors.applicationStartsAt || 'A new start date cannot be in the past.'} /><TextField required type="datetime-local" label="End at" InputLabelProps={{ shrink: true }} value={form.applicationEndsAt} onChange={(e) => updateField('applicationEndsAt', e.target.value)} error={!!fieldErrors.applicationEndsAt} helperText={fieldErrors.applicationEndsAt} /></Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Voting dates</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}><TextField required type="datetime-local" label="Voting start at" inputProps={{ min: editing?.votingStartsAt && new Date(editing.votingStartsAt.replace(' ', 'T')).getTime() < Date.now() ? dateInput(editing.votingStartsAt) : dateTimeLocalNow() }} InputLabelProps={{ shrink: true }} value={form.votingStartsAt} onChange={(e) => updateField('votingStartsAt', e.target.value)} error={!!fieldErrors.votingStartsAt} helperText={fieldErrors.votingStartsAt || 'A new start date cannot be in the past.'} /><TextField required type="datetime-local" label="Voting end at" InputLabelProps={{ shrink: true }} value={form.votingEndsAt} onChange={(e) => updateField('votingEndsAt', e.target.value)} error={!!fieldErrors.votingEndsAt} helperText={fieldErrors.votingEndsAt} /></Box>
          <TextField required select fullWidth label="Application access" value={form.applicationStatus} onChange={(e) => updateField('applicationStatus', e.target.value)} sx={{ mt: 2 }} helperText="Automatic closes at the end date. Open application allows the admin to reopen applications.">
            {['Automatic', 'Open', 'Closed'].map((applicationStatus) => <MenuItem key={applicationStatus} value={applicationStatus}>{applicationStatus === 'Open' ? 'Open application' : applicationStatus === 'Closed' ? 'Closed application' : applicationStatus}</MenuItem>)}
          </TextField>
          <TextField required select fullWidth label="Voting access" value={form.votingAccess} onChange={(e) => updateField('votingAccess', e.target.value)} error={!!fieldErrors.votingAccess} helperText={fieldErrors.votingAccess || 'Automatic opens voting at the voting start date and closes it at the voting end date.'} sx={{ mt: 2 }}>
            {['Automatic', 'Open', 'Closed'].map((votingAccess) => <MenuItem key={votingAccess} value={votingAccess}>{votingAccess === 'Open' ? 'Open voting' : votingAccess === 'Closed' ? 'Close voting' : 'Automatic'}</MenuItem>)}
          </TextField>
        </DialogContent><DialogActions><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="contained" onClick={save}>Save</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
