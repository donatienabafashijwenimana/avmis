import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Add, CheckCircle, Close, Edit, HighlightOff } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { apiRequest } from '../lib/api';
import TableActions from '../components/TableActions';
import ValidatedTextField from '../components/ValidatedTextField';
import { emailError, partyFieldErrors, requiredText, validCode } from '../lib/validation';
import ListToolbar from '../components/ListToolbar';

const blankParty = { name: '', email: '', abbreviation: '', slogan: '', logo: '', status: 'Pending' };

const statusColor = { Pending: 'warning', Approved: 'info', Active: 'success', Inactive: 'default', Rejected: 'error' };

const readLogo = (event, setForm, form, setFieldErrors) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    toast.error('Party logo must be a JPEG or PNG image under 2MB.');
    setFieldErrors((current) => ({ ...current, logo: 'Party logo must be a JPEG or PNG image under 2MB.' }));
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    setForm({ ...form, logo: reader.result });
    setFieldErrors((current) => ({ ...current, logo: '' }));
  };
  reader.readAsDataURL(file);
};

export default function PoliticalPartiesPage() {
  const [parties, setParties] = useState([]);
  const [form, setForm] = useState(blankParty);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('name-asc');

  const loadParties = () => apiRequest('/political_parties.php?manage=1')
    .then((response) => setParties(response.parties || []))
    .catch((requestError) => setError(requestError.message || 'Political parties could not be loaded.'))
    .finally(() => setLoading(false));

  useEffect(() => {
    loadParties();
    const interval = window.setInterval(loadParties, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const visibleParties = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = parties.filter((party) => {
      const matchesSearch = !query || [party.name, party.abbreviation, party.email, party.slogan]
        .some((value) => String(value || '').toLowerCase().includes(query));
      return matchesSearch && (!statusFilter || party.status === statusFilter);
    });
    return rows.sort((left, right) => {
      const [field, direction] = sort.split('-');
      const comparison = String(left[field] || '').localeCompare(String(right[field] || ''));
      return direction === 'desc' ? -comparison : comparison;
    });
  }, [parties, search, sort, statusFilter]);
  const safePage = Math.min(page, Math.max(0, Math.ceil(visibleParties.length / rowsPerPage) - 1));
  const paginatedParties = visibleParties.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);

  const openForm = (party = null) => {
    setEditing(party);
    setForm(party ? { ...blankParty, ...party } : blankParty);
    setError('');
    setFieldErrors({});
    setOpen(true);
  };

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: '' }));
  };

  const save = async (statusOverride = null) => {
    const nextFieldErrors = partyFieldErrors(form);
    setFieldErrors(nextFieldErrors);
    if (Object.values(nextFieldErrors).some(Boolean)) {
      setError('Please correct the highlighted fields.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, status: statusOverride || form.status };
      const response = await apiRequest(
        editing ? `/political_parties.php?id=${editing.id}` : '/political_parties.php',
        { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) },
      );
      if (editing) {
        setParties((current) => current.map((party) => (party.id === editing.id ? response.party : party)));
        if (statusOverride) {
          toast.success(`Party ${statusOverride.toLowerCase()}.`);
          if (!response.emailSent) toast.warn('Party updated, but the notification email could not be sent.');
        } else {
          toast.success('Political party updated.');
        }
      } else {
        setParties((current) => [...current, response.party]);
        toast.success('Political party submitted for approval.');
      }
      setOpen(false);
    } catch (requestError) {
      setError(requestError.message || 'Political party could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const review = async (party, status) => {
    setSaving(true);
    setError('');
    try {
      const response = await apiRequest(`/political_parties.php?id=${party.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      setParties((current) => current.map((item) => (item.id === party.id ? response.party : item)));
      toast.success(`Party ${status.toLowerCase()}.`);
      if (!response.emailSent) toast.warn('Party updated, but the notification email could not be sent.');
    } catch (requestError) {
      toast.error(requestError.message || 'Party status could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box className="print-table-page">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Political Parties</Typography>
          <Typography color="text.secondary">Approve or reject parties, review decisions again when needed, then activate or deactivate approved parties.</Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => openForm()}>Register party</Button>
      </Box>

      {error && !open && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? <CircularProgress /> : (
        <Card sx={{ borderRadius: 3 }}>
          <CardContent>
            <ListToolbar
              search={search}
              onSearch={(value) => { setSearch(value); setPage(0); }}
              searchLabel="Search parties"
              filter={statusFilter}
              onFilter={(value) => { setStatusFilter(value); setPage(0); }}
              filterLabel="Status"
              filterOptions={[{ value: '', label: 'All statuses' }, ...Object.keys(statusColor).map((value) => ({ value, label: value }))]}
              sort={sort}
              onSort={(value) => { setSort(value); setPage(0); }}
              sortOptions={[{ value: 'name-asc', label: 'Name (A–Z)' }, { value: 'name-desc', label: 'Name (Z–A)' }, { value: 'status-asc', label: 'Status' }]}
              onPrint={() => window.print()}
            />
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow>
                  <TableCell>Party</TableCell><TableCell>Abbreviation</TableCell><TableCell>Email</TableCell>
                  <TableCell>Slogan</TableCell><TableCell>Status</TableCell><TableCell align="right" className="print-hide">Actions</TableCell>
                </TableRow></TableHead>
                <TableBody className="screen-table-body">
                  {paginatedParties.map((party) => (
                    <TableRow key={party.id} hover>
                      <TableCell>{party.name}</TableCell>
                      <TableCell>{party.abbreviation || '—'}</TableCell>
                      <TableCell>{party.email || '—'}</TableCell>
                      <TableCell>{party.slogan || '—'}</TableCell>
                      <TableCell><Chip size="small" label={party.status} color={statusColor[party.status] || 'default'} /></TableCell>
                      <TableCell align="right" className="print-hide">
                        <TableActions actions={[
                          { key: 'edit', label: 'Edit party', icon: <Edit fontSize="small" />, onClick: () => openForm(party) },
                          { key: 'approve', label: party.status === 'Rejected' ? 'Approve party again' : 'Approve party', icon: <CheckCircle fontSize="small" />, color: 'success', show: party.status === 'Pending' || party.status === 'Rejected', onClick: () => review(party, 'Approved') },
                          { key: 'reject', label: party.status === 'Approved' ? 'Reject approved party' : 'Reject party', icon: <HighlightOff fontSize="small" />, color: 'error', show: party.status === 'Pending' || party.status === 'Approved', onClick: () => review(party, 'Rejected') },
                          { key: 'activate', label: 'Activate party', icon: <CheckCircle fontSize="small" />, color: 'success', show: party.status === 'Approved' || party.status === 'Inactive', onClick: () => review(party, 'Active') },
                          { key: 'deactivate', label: 'Deactivate party', icon: <HighlightOff fontSize="small" />, color: 'warning', show: party.status === 'Active', onClick: () => review(party, 'Inactive') },
                        ]} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {!visibleParties.length && <TableRow><TableCell colSpan={6} align="center">{parties.length ? 'No parties match the current filters.' : 'No political parties have been registered.'}</TableCell></TableRow>}
                </TableBody>
                <TableBody className="print-table-body">
                  {visibleParties.map((party) => (
                    <TableRow key={party.id}>
                      <TableCell>{party.name}</TableCell>
                      <TableCell>{party.abbreviation || '—'}</TableCell>
                      <TableCell>{party.email || '—'}</TableCell>
                      <TableCell>{party.slogan || '—'}</TableCell>
                      <TableCell>{party.status}</TableCell>
                    </TableRow>
                  ))}
                  {!visibleParties.length && <TableRow><TableCell colSpan={5} align="center">{parties.length ? 'No parties match the current filters.' : 'No political parties have been registered.'}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
            {visibleParties.length > 0 && (
              <TablePagination
                component="div"
                count={visibleParties.length}
                page={safePage}
                onPageChange={(_, nextPage) => setPage(nextPage)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(event) => {
                  setRowsPerPage(Number(event.target.value));
                  setPage(0);
                }}
                rowsPerPageOptions={[5, 10, 25]}
              />
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'Edit political party' : 'Register political party'}<IconButton onClick={() => setOpen(false)} sx={{ float: 'right' }}><Close /></IconButton></DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <ValidatedTextField autoFocus required fullWidth label="Party name" value={form.name} validate={requiredText('Party name', 120)} error={fieldErrors.name} helperText={fieldErrors.name} inputProps={{ maxLength: 120 }} onChange={(e) => updateField('name', e.target.value)} sx={{ mt: 1, mb: 2 }} />
          <ValidatedTextField required fullWidth type="email" label="Notification email" value={form.email} validate={emailError} error={fieldErrors.email} helperText={fieldErrors.email} inputProps={{ maxLength: 255 }} onChange={(e) => updateField('email', e.target.value)} sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <ValidatedTextField required fullWidth label="Abbreviation" value={form.abbreviation} validate={(value) => validCode(value) ? '' : 'Use 2–32 letters, numbers, hyphens, or underscores.'} error={fieldErrors.abbreviation} helperText={fieldErrors.abbreviation} inputProps={{ maxLength: 32 }} onChange={(e) => updateField('abbreviation', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} />
            <ValidatedTextField required fullWidth label="Slogan" value={form.slogan} validate={requiredText('Slogan', 500)} error={fieldErrors.slogan} helperText={fieldErrors.slogan} inputProps={{ maxLength: 500 }} onChange={(e) => updateField('slogan', e.target.value)} />
          </Box>
          <Button component="label" variant="outlined" fullWidth sx={{ justifyContent: 'flex-start', mb: form.logo ? 1 : 0 }}>
            {form.logo ? 'Change party logo' : 'Upload party logo (optional)'}
            <input hidden required={!form.logo} type="file" accept="image/jpeg,image/png" onChange={(event) => readLogo(event, setForm, form, setFieldErrors)} />
          </Button>
          {fieldErrors.logo && <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5, mb: 1 }}>{fieldErrors.logo}</Typography>}
          {form.logo && <Box component="img" src={form.logo} alt="Party logo preview" sx={{ display: 'block', maxWidth: 100, maxHeight: 70, objectFit: 'contain', borderRadius: 1 }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={() => save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
