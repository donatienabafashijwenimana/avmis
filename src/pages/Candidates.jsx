import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Avatar,
  Alert,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import {
  Add,
  Edit,
  Block,
  CheckCircle,
  Visibility,
  Badge,
  PhotoCamera,
  Warning,
  Close,
  Delete,
  Print as PrintIcon,
} from '@mui/icons-material';
import { useDataStore } from '../stores/dataStore';
import TableActions from '../components/TableActions';
import { toast } from 'react-toastify';
import UploadedDocumentPreview from '../components/UploadedDocumentPreview';

const emptyForm = {
  username: '',
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  nationalId: '',
  nationalIdDocument: '',
  candidateNumber: '',
  biography: '',
  party: '',
  photo: '',
};

export default function CandidatesPage() {
  const candidates = useDataStore((s) => s.candidates);
  const addCandidate = useDataStore((s) => s.addCandidate);
  const updateCandidate = useDataStore((s) => s.updateCandidate);
  const setCandidateStatus = useDataStore((s) => s.setCandidateStatus);
  const deleteCandidate = useDataStore((s) => s.deleteCandidate);
  const partyRecords = useDataStore((s) => s.parties);
  const [formOpen, setFormOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [permanentDeleteOpen, setPermanentDeleteOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [photoPreview, setPhotoPreview] = useState('');
  const [nationalIdPreview, setNationalIdPreview] = useState('');
  const [search, setSearch] = useState('');
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 5 });
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState('');

  const parties = partyRecords.map((party) => party.name);
  const filteredCandidates = candidates.filter((candidate) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [candidate.name, candidate.nationalId, candidate.candidateNumber, candidate.party]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });

  const handleOpenAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setPhotoPreview('');
    setNationalIdPreview('');
    setFormErrors({});
    setFormOpen(true);
  };

  const handleOpenEdit = (candidate) => {
    setEditing(candidate);
    setForm({
      username: candidate.username || '',
      name: candidate.name,
      email: candidate.email || '',
      password: '',
      confirmPassword: '',
      nationalId: candidate.nationalId || '',
      nationalIdDocument: candidate.nationalIdDocument || '',
      candidateNumber: candidate.candidateNumber || '',
      biography: candidate.biography || '',
      party: candidate.party,
      photo: candidate.photo,
    });
    setPhotoPreview(candidate.photo);
    setNationalIdPreview(candidate.nationalIdDocument || '');
    setFormErrors({});
    setFormOpen(true);
  };

  const handleOpenView = (candidate) => {
    setSelected(candidate);
    setViewOpen(true);
  };

  const handleOpenDelete = (candidate) => {
    setSelected(candidate);
    setDeleteOpen(true);
  };

  const handleOpenPermanentDelete = (candidate) => {
    setSelected(candidate);
    setPermanentDeleteOpen(true);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setFormErrors((prev) => ({ ...prev, photo: 'Only JPEG/PNG files allowed' }));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFormErrors((prev) => ({ ...prev, photo: 'File must be under 2MB' }));
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result);
      setForm((prev) => ({ ...prev, photo: reader.result }));
      setFormErrors((prev) => ({ ...prev, photo: '' }));
    };
    reader.readAsDataURL(file);
  };

  const handleNationalIdChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setFormErrors((prev) => ({ ...prev, nationalIdDocument: 'Only JPEG/PNG files allowed' }));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFormErrors((prev) => ({ ...prev, nationalIdDocument: 'File must be under 2MB' }));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setNationalIdPreview(reader.result);
      setForm((prev) => ({ ...prev, nationalIdDocument: reader.result }));
      setFormErrors((prev) => ({ ...prev, nationalIdDocument: '' }));
    };
    reader.readAsDataURL(file);
  };

  const validateForm = () => {
    const errors = {};
    if (!editing && !/^[A-Za-z0-9_-]{4,32}$/.test(form.username)) {
      errors.username = 'Username must be 4–32 letters, numbers, underscores, or hyphens';
    }
    if (!form.name.trim()) errors.name = 'Name is required';
    if (!editing && !form.email.trim()) errors.email = 'Email is required';
    if (!editing && form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email address';
    if (!editing && !form.password) errors.password = 'Password is required';
    if (!editing && form.password) {
      const checks = [];
      if (!/[A-Z]/.test(form.password)) checks.push('uppercase letter');
      if (!/[0-9]/.test(form.password)) checks.push('number');
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(form.password)) checks.push('special character');
      if (form.password.length < 8) checks.push('8+ characters');
      if (checks.length) errors.password = `Password needs: ${checks.join(', ')}`;
    }
    if (!editing && form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match';
    if (!form.candidateNumber.trim()) errors.candidateNumber = 'Candidate number is required';
    if (!/^1[12]\d{14}$/.test(form.nationalId)) errors.nationalId = 'Candidate National ID must start with 11 or 12 and contain exactly 16 digits';
    if (!form.party) errors.party = 'Party is required';
    if (!form.biography.trim()) errors.biography = 'Biography is required';
    if (!form.photo) errors.photo = 'Candidate photo is required';
    if (!form.nationalIdDocument) errors.nationalIdDocument = 'National ID document is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSaving(true);
    setPageError('');
    try {
      if (editing) {
        await updateCandidate(editing.id, form);
        toast.success('Candidate updated successfully.');
      } else {
        await addCandidate(form);
        toast.success('Candidate added successfully.');
      }
      setFormOpen(false);
    } catch (error) {
      toast.error(error.message || 'Candidate could not be saved.');
      setPageError(error.message || 'Candidate could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const nextStatus = selected.status === 'Inactive' ? 'Active' : 'Inactive';
      await setCandidateStatus(selected.id, nextStatus);
      setDeleteOpen(false);
      toast.success(`Candidate ${nextStatus === 'Active' ? 'activated' : 'deactivated'} successfully.`);
    } catch (error) {
      toast.error(error.message || 'Candidate status could not be changed.');
      setPageError(error.message || 'Candidate status could not be changed.');
    }
  };

  const handlePermanentDelete = async () => {
    try {
      await deleteCandidate(selected.id);
      setPermanentDeleteOpen(false);
      setSelected(null);
      toast.success('Candidate account permanently deleted.');
    } catch (error) {
      toast.error(error.message || 'Candidate could not be deleted.');
      setPageError(error.message || 'Candidate could not be deleted.');
    }
  };

  const columns = [
    {
      field: 'photo',
      headerName: '',
      width: 60,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Avatar src={params.row.photo} sx={{ width: 36, height: 36 }} />
      ),
    },
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 150 },
    { field: 'nationalId', headerName: 'National ID', width: 165 },
    { field: 'party', headerName: 'Party', width: 140 },
    {
      field: 'status',
      headerName: 'Status',
      width: 100,
      renderCell: (params) => <Chip size="small" label={params.value || 'Active'} color={params.value === 'Inactive' ? 'default' : 'success'} />,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 200,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <TableActions actions={[
          { key: 'view', label: 'View candidate', icon: <Visibility fontSize="small" />, onClick: () => handleOpenView(params.row) },
          { key: 'edit', label: 'Edit candidate', icon: <Edit fontSize="small" />, onClick: () => handleOpenEdit(params.row) },
          { key: 'status', label: params.row.status === 'Inactive' ? 'Activate candidate' : 'Deactivate candidate', icon: params.row.status === 'Inactive' ? <CheckCircle fontSize="small" /> : <Block fontSize="small" />, color: params.row.status === 'Inactive' ? 'success' : 'error', onClick: () => handleOpenDelete(params.row) },
          { key: 'delete', label: 'Permanently delete candidate without an application', icon: <Delete fontSize="small" />, color: 'error', show: Number(params.row.applicationCount || 0) === 0, onClick: () => handleOpenPermanentDelete(params.row) },
        ]} />
      ),
    },
  ];

  return (
    <Box className="print-table-page">
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        {pageError && <Alert severity="error" sx={{ width: '100%', mb: 1 }}>{pageError}</Alert>}
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Candidate Management
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {candidates.length} registered candidates
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            label="Search candidates"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPaginationModel((current) => ({ ...current, page: 0 }));
            }}
          />
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleOpenAdd}
            sx={{ borderRadius: 2 }}
          >
            Add Candidate
          </Button>
          <Button
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={() => window.print()}
            sx={{ borderRadius: 2 }}
          >
            Print List
          </Button>
        </Box>
      </Box>

      <Card elevation={2} sx={{ borderRadius: 3, overflow: 'hidden', border: '1px solid', borderColor: '#c8e6c9' }}>
<DataGrid
  rows={filteredCandidates}
  columns={columns}
  pagination
  paginationModel={paginationModel}
  onPaginationModelChange={setPaginationModel}
  pageSizeOptions={[5, 10, 15, 25]}
  showToolbar
  slotProps={{ toolbar: { showQuickFilter: true } }}
  disableRowSelectionOnClick
  autoHeight
  filterMode="client"
  sx={{
    border: 'none',
    '& .MuiDataGrid-columnHeaders': {
      bgcolor: '#e8f5e9',
      borderBottom: '2px solid #a5d6a7',
      '& .MuiDataGrid-columnHeaderTitle': {
        fontWeight: 700,
        color: '#1b5e20',
        fontSize: '0.85rem',
      },
    },
    '& .MuiDataGrid-cell': {
      borderBottom: '1px solid #f1f8e9',
      fontSize: '0.875rem',
    },
    '& .MuiDataGrid-row': {
      '&:nth-of-type(even)': {
        // bgcolor: '#fafff5',
      },
      '&:hover': {
        bgcolor: '#e8f5e9 !important',
        color: '#1b5e20',
      },
    },
    '& .MuiDataGrid-footerContainer': {
      borderTop: '2px solid #a5d6a7',
      // bgcolor: '#f1f8e9',
    },
  }}
/>
      </Card>

      <table className="print-only-table">
        <thead><tr><th>Name</th><th>National ID</th><th>Candidate number</th><th>Party</th><th>Status</th></tr></thead>
        <tbody>{filteredCandidates.map((candidate) => <tr key={candidate.id}><td>{candidate.name}</td><td>{candidate.nationalId || '—'}</td><td>{candidate.candidateNumber || '—'}</td><td>{candidate.party || '—'}</td><td>{candidate.status || 'Active'}</td></tr>)}</tbody>
      </table>

      <Dialog open={formOpen} onClose={() => !saving && setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {editing ? 'Edit Candidate' : 'Create Candidate Account'}
          <IconButton onClick={() => setFormOpen(false)} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {photoPreview ? (
            <img src={photoPreview} alt="Preview" className="candidates-page__photo-preview" />
          ) : (
            <Box className="candidates-page__photo-placeholder">
              <PhotoCamera />
            </Box>
          )}

          <Button
            variant="outlined"
            component="label"
            startIcon={<PhotoCamera />}
            fullWidth
            sx={{ mb: 3, borderRadius: 2 }}
          >
            Upload Photo
            <input type="file" hidden required={!form.photo} accept="image/jpeg,image/png" onChange={handlePhotoChange} />
          </Button>
          {formErrors.photo && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formErrors.photo}
            </Alert>
          )}

          {nationalIdPreview && (
            <UploadedDocumentPreview label="Current National ID document" src={nationalIdPreview} alt="Current National ID document" />
          )}
          <Button
            variant="outlined"
            component="label"
            startIcon={<Badge />}
            fullWidth
            sx={{ mb: 2, borderRadius: 2 }}
          >
            Upload National ID
            <input type="file" hidden required={!form.nationalIdDocument} accept="image/jpeg,image/png" onChange={handleNationalIdChange} />
          </Button>
          {formErrors.nationalIdDocument && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formErrors.nationalIdDocument}
            </Alert>
          )}

          <TextField
            fullWidth
            required
            label="Full Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={!!formErrors.name}
            helperText={formErrors.name}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            required
            label="Candidate National ID"
            inputProps={{ maxLength: 16, inputMode: 'numeric' }}
            value={form.nationalId}
            onChange={(e) => setForm({ ...form, nationalId: e.target.value.replace(/\D/g, '') })}
            error={!!formErrors.nationalId}
            helperText={formErrors.nationalId || '16 digits starting with 11 or 12'}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            required
            label="Candidate Number"
            inputProps={{ maxLength: 32 }}
            value={form.candidateNumber}
            onChange={(e) => setForm({ ...form, candidateNumber: e.target.value.replace(/[^A-Za-z0-9-]/g, '') })}
            error={!!formErrors.candidateNumber}
            helperText={formErrors.candidateNumber || 'Unique identifier shown on the ballot.'}
            sx={{ mb: 2 }}
          />

          <TextField
            select
            fullWidth
            required
            label="Party"
            value={form.party}
            onChange={(e) => setForm({ ...form, party: e.target.value })}
            error={!!formErrors.party}
            helperText={formErrors.party}
            sx={{ mb: 2 }}
          >
            {parties.map((p) => (
              <MenuItem key={p} value={p}>
                {p}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            fullWidth
            required
            label="Biography"
            inputProps={{ maxLength: 2000 }}
            multiline
            rows={3}
            value={form.biography}
            onChange={(e) => setForm({ ...form, biography: e.target.value })}
            sx={{ mt: 2 }}
          />

          {!editing && (
            <>
              <TextField
                fullWidth
                required
                label="Candidate Username"
                inputProps={{ maxLength: 32 }}
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.replace(/[^A-Za-z0-9_-]/g, '') })}
                error={!!formErrors.username}
                helperText={formErrors.username || 'Username used to sign in'}
                sx={{ mt: 2, mb: 2 }}
              />
              <TextField
                fullWidth
                required
                type="email"
                label="Email Address"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                error={!!formErrors.email}
                helperText={formErrors.email}
                sx={{ mb: 2 }}
              />
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <TextField
                  fullWidth
                  required
                  type="password"
                  label="Password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  error={!!formErrors.password}
                  helperText={formErrors.password || 'Uppercase, number, special character, 8+ chars'}
                />
                <TextField
                  fullWidth
                  required
                  type="password"
                  label="Confirm Password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  error={!!formErrors.confirmPassword}
                  helperText={formErrors.confirmPassword}
                />
              </Box>
            </>
          )}

        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setFormOpen(false)} disabled={saving} variant="outlined" sx={{ borderRadius: 2 }}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving} variant="contained" sx={{ borderRadius: 2 }}>
            {saving ? 'Saving...' : editing ? 'Update' : 'Add Candidate'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Candidate Details
          <IconButton onClick={() => setViewOpen(false)} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selected && (
            <Box>
              <Avatar
                src={selected.photo}
                sx={{ width: 112, height: 112, mx: 'auto', mb: 2 }}
              />
              <Typography variant="h6" align="center" sx={{ fontWeight: 700 }}>
                {selected.name}
              </Typography>
              <Chip
                label={selected.status || 'Active'}
                color={selected.status === 'Inactive' ? 'default' : 'success'}
                size="small"
                sx={{ display: 'flex', width: 'fit-content', mx: 'auto', mt: 1 }}
              />

              <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
                {[
                  ['Candidate ID', selected.id],
                  ['User ID', selected.userId],
                  ['Username', selected.username],
                  ['Email', selected.email],
                  ['Candidate National ID', selected.nationalId],
                  ['Candidate number', selected.candidateNumber],
                  ['Party', selected.party],
                  ['Party ID', selected.partyId],
                  ['Position', selected.position],
                  ['Position ID', selected.positionId],
                  ['Category', selected.category],
                  ['Polling district', selected.pollingDistrict],
                  ['Application status', selected.applicationStatus],
                  ['Application count', selected.applicationCount ?? 0],
                  ['Votes', selected.votes ?? 0],
                ].map(([label, value]) => (
                  <Box key={label} sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'action.hover' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>{label}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
                      {value === null || value === undefined || String(value).trim() === '' ? 'Not recorded' : value}
                    </Typography>
                  </Box>
                ))}
              </Box>

              <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
                <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Biography</Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{selected.biography || 'Not recorded'}</Typography>
              </Box>
              <Box sx={{ mt: 1.5, p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
                <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Application message</Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{selected.applicationMessage || 'Not recorded'}</Typography>
              </Box>
              <Box sx={{ mt: 1.5, p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
                <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Eligibility criteria</Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{selected.criteria || 'Not recorded'}</Typography>
              </Box>
              <Box sx={{ mt: 1.5, p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
                <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Required documents</Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{selected.requiredDocuments || 'Not recorded'}</Typography>
              </Box>
              <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <UploadedDocumentPreview label="Candidate photo" src={selected.photo} alt={`${selected.name} candidate photo`} />
                <UploadedDocumentPreview label="National ID document" src={selected.nationalIdDocument} alt={`${selected.name} National ID document`} />
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setViewOpen(false)} variant="outlined" sx={{ borderRadius: 2 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm {selected?.status === 'Inactive' ? 'Activation' : 'Deactivation'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, borderRadius: 2, bgcolor: 'error.main', color: '#fff', mb: 2, opacity: 0.9 }}>
            <Warning />
            <Typography variant="body2">
              {selected?.status === 'Inactive' ? 'Activate' : 'Deactivate'} <strong>{selected?.name}</strong>? Existing election records remain intact.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteOpen(false)} variant="outlined" sx={{ borderRadius: 2 }}>
            Cancel
          </Button>
          <Button onClick={handleDelete} variant="contained" color={selected?.status === 'Inactive' ? 'success' : 'error'} sx={{ borderRadius: 2 }}>
            {selected?.status === 'Inactive' ? 'Activate' : 'Deactivate'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={permanentDeleteOpen} onClose={() => setPermanentDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Permanently delete candidate?</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, borderRadius: 2, bgcolor: 'error.main', color: '#fff', mb: 2, opacity: 0.9 }}>
            <Warning />
            <Typography variant="body2">
              Delete <strong>{selected?.name}</strong> permanently? This is allowed because the candidate has not submitted an application. The account and uploaded files will be removed.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setPermanentDeleteOpen(false)} variant="outlined">Cancel</Button>
          <Button onClick={handlePermanentDelete} variant="contained" color="error">Delete permanently</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
