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
  InputAdornment,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import {
  Add,
  Edit,
  Block,
  CheckCircle,
  Visibility,
  Badge,
  Warning,
  Close,
  Delete,
  PhotoCamera,
  Print as PrintIcon,
} from '@mui/icons-material';
import { useDataStore } from '../stores/dataStore';
import TableActions from '../components/TableActions';
import UploadedDocumentPreview from '../components/UploadedDocumentPreview';
import { toast } from 'react-toastify';

const fallbackDistricts = [
  'District A - Kigali',
  'District B - Huye',
  'District C - Musanze',
  'District D - Rubavu',
  'District E - Muhanga',
  'District F - Nyagatare',
  'District G - Rusizi',
];

const emptyForm = {
  voterId: '',
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  pollingDistrict: '',
  status: 'Active',
  idPhoto: '',
  nationalIdDocument: '',
};

export default function VotersPage() {
  const rawVoters = useDataStore((s) => s.voters);
  const addVoter = useDataStore((s) => s.addVoter);
  const updateVoter = useDataStore((s) => s.updateVoter);
  const setVoterStatus = useDataStore((s) => s.setVoterStatus);
  const deleteVoter = useDataStore((s) => s.deleteVoter);
  const managedDistricts = useDataStore((s) => s.districts);
  const districts = managedDistricts.length ? managedDistricts.filter((district) => district.status === 'Active').map((district) => district.name) : fallbackDistricts;

  const voters = rawVoters;
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
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState('');

  const filteredVoters = voters.filter((voter) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [voter.name, voter.voterId, voter.email, voter.pollingDistrict, voter.status]
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

  const handleOpenEdit = (voter) => {
    setEditing(voter);
    setForm({
      voterId: voter.voterId,
      name: voter.name,
      email: voter.email,
      password: '',
      confirmPassword: '',
      pollingDistrict: voter.pollingDistrict,
      status: voter.status,
      idPhoto: voter.idPhoto,
      nationalIdDocument: voter.nationalIdDocument || '',
    });
    setPhotoPreview(voter.idPhoto);
    setNationalIdPreview(voter.nationalIdDocument || '');
    setFormErrors({});
    setFormOpen(true);
  };

  const handleOpenView = (voter) => {
    setSelected(voter);
    setViewOpen(true);
  };

  const handleOpenDelete = (voter) => {
    setSelected(voter);
    setDeleteOpen(true);
  };

  const handleOpenPermanentDelete = (voter) => {
    setSelected(voter);
    setPermanentDeleteOpen(true);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setFormErrors((prev) => ({ ...prev, idPhoto: 'Only JPEG/PNG files allowed' }));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFormErrors((prev) => ({ ...prev, idPhoto: 'File must be under 2MB' }));
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result);
      setForm((prev) => ({ ...prev, idPhoto: reader.result }));
      setFormErrors((prev) => ({ ...prev, idPhoto: '' }));
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

    // Voter ID - numeric only
    if (!form.voterId.trim()) {
      errors.voterId = 'Voter ID is required';
    } else if (!/^\d+$/.test(form.voterId)) {
      errors.voterId = 'Voter ID must contain numbers only';
    } else if (!/^1[12]\d{14}$/.test(form.voterId)) {
      errors.voterId = 'National ID must start with 11 or 12 and contain exactly 16 digits';
    }

    // Name
    if (!form.name.trim()) errors.name = 'Name is required';

    // Email validation
    if (!form.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = 'Invalid email format';
    }

    // Password strength
    if (!editing && !form.password) {
      errors.password = 'Password is required';
    } else if (form.password) {
      const checks = [];
      if (!/[A-Z]/.test(form.password)) checks.push('uppercase letter');
      if (!/[0-9]/.test(form.password)) checks.push('number');
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(form.password)) checks.push('special character');
      if (form.password.length < 8) checks.push('minimum 8 characters');
      if (checks.length > 0) {
        errors.password = `Password needs: ${checks.join(', ')}`;
      }
    }
    if (!editing && form.password !== form.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    // District
    if (!form.pollingDistrict) errors.pollingDistrict = 'District is required';
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
        await updateVoter(editing.id, form);
      } else {
        await addVoter(form);
      }
      toast.success(editing ? 'Voter updated successfully.' : 'Voter registered successfully.');
      setFormOpen(false);
    } catch (error) {
      toast.error(error.message || 'Voter could not be saved.');
      setPageError(error.message || 'Voter could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const nextStatus = selected.status === 'Inactive' ? 'Active' : 'Inactive';
      await setVoterStatus(selected.id, nextStatus);
      setDeleteOpen(false);
      toast.success(`Voter ${nextStatus === 'Active' ? 'activated' : 'deactivated'} successfully.`);
    } catch (error) {
      toast.error(error.message || 'Voter status could not be changed.');
      setPageError(error.message || 'Voter status could not be changed.');
    }
  };

  const handlePermanentDelete = async () => {
    try {
      await deleteVoter(selected.id);
      setPermanentDeleteOpen(false);
      setSelected(null);
      toast.success('Voter account permanently deleted.');
    } catch (error) {
      toast.error(error.message || 'Voter could not be deleted.');
      setPageError(error.message || 'Voter could not be deleted.');
    }
  };

  const columns = [
    {
      field: 'idPhoto',
      headerName: '',
      width: 50,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Avatar src={params.row.idPhoto} sx={{ width: 32, height: 32 }} />
      ),
    },
    { field: 'voterId', headerName: 'Voter ID', width: 160 },
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 140 },
    { field: 'email', headerName: 'Email', flex: 1, minWidth: 180 },
    { field: 'pollingDistrict', headerName: 'District', width: 160 },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      renderCell: (params) => (
        <Chip
          label={params.value}
          size="small"
          color={params.value === 'Active' ? 'success' : 'error'}
          variant="filled"
          sx={{ fontWeight: 600, fontSize: '0.75rem' }}
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 160,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <TableActions actions={[
          { key: 'view', label: 'View voter', icon: <Visibility fontSize="small" />, onClick: () => handleOpenView(params.row) },
          { key: 'edit', label: 'Edit voter', icon: <Edit fontSize="small" />, onClick: () => handleOpenEdit(params.row) },
          { key: 'status', label: params.row.status === 'Inactive' ? 'Activate voter' : 'Deactivate voter', icon: params.row.status === 'Inactive' ? <CheckCircle fontSize="small" /> : <Block fontSize="small" />, color: params.row.status === 'Inactive' ? 'success' : 'error', onClick: () => handleOpenDelete(params.row) },
          { key: 'delete', label: 'Permanently delete voter without votes', icon: <Delete fontSize="small" />, color: 'error', show: Number(params.row.voteCount || 0) === 0, onClick: () => handleOpenPermanentDelete(params.row) },
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
            Voter Management
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {voters.length} registered voters
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            label="Search voters"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleOpenAdd}
            sx={{ borderRadius: 2 }}
          >
            Register Voter
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
          rows={filteredVoters}
          columns={columns}
          initialState={{ pagination: { paginationModel: { pageSize: 5, page: 0 } } }}
          pageSizeOptions={[5, 10, 25]}
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
              },
              '&:hover': {
                bgcolor: '#e8f5e9 !important',
                color: '#1b5e20',
              },
            },
            '& .MuiDataGrid-footerContainer': {
              borderTop: '2px solid #a5d6a7',
            },
          }}
        />
      </Card>

      <table className="print-only-table">
        <thead><tr><th>Voter ID</th><th>Name</th><th>Email</th><th>Polling district</th><th>Status</th></tr></thead>
        <tbody>{filteredVoters.map((voter) => <tr key={voter.id}><td>{voter.voterId}</td><td>{voter.name}</td><td>{voter.email}</td><td>{voter.pollingDistrict}</td><td>{voter.status}</td></tr>)}</tbody>
      </table>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onClose={() => !saving && setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {editing ? 'Update Voter' : 'Create Voter Account'}
          <IconButton onClick={() => setFormOpen(false)} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {photoPreview ? (
            <img src={photoPreview} alt="ID Preview" className="voters-page__photo-preview" />
          ) : (
            <Box className="voters-page__photo-placeholder">
              <Badge />
            </Box>
          )}

          <Button
            variant="outlined"
            component="label"
            startIcon={<PhotoCamera />}
            fullWidth
            sx={{ mb: 3, borderRadius: 2 }}
          >
            Upload ID Photo
            <input type="file" hidden required={!form.idPhoto} accept="image/jpeg,image/png" onChange={handlePhotoChange} />
          </Button>
          {formErrors.idPhoto && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formErrors.idPhoto}
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
            sx={{ mb: 1, borderRadius: 2 }}
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
            label="Voter ID (National ID Number)"
            inputProps={{ maxLength: 16, inputMode: 'numeric' }}
            value={form.voterId}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '');
              setForm({ ...form, voterId: val });
            }}
            error={!!formErrors.voterId}
            helperText={formErrors.voterId || '16 digits starting with 11 or 12'}
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><Badge fontSize="small" /></InputAdornment>,
            }}
          />

          <TextField
            fullWidth
            required
            label="Full Name"
            inputProps={{ maxLength: 120 }}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={!!formErrors.name}
            helperText={formErrors.name}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            required
            label="Email Address"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            error={!!formErrors.email}
            helperText={formErrors.email || 'Valid email format required'}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            required
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            error={!!formErrors.password}
            helperText={formErrors.password || 'Must contain: uppercase, number, special char, 8+ chars'}
            sx={{ mb: 2 }}
          />

          {!editing && (
            <TextField
              fullWidth
              required
              label="Confirm Password"
              type="password"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              error={!!formErrors.confirmPassword}
              helperText={formErrors.confirmPassword}
              sx={{ mb: 2 }}
            />
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              select
              required
              label="Polling District"
              value={form.pollingDistrict}
              onChange={(e) => setForm({ ...form, pollingDistrict: e.target.value })}
              error={!!formErrors.pollingDistrict}
              helperText={formErrors.pollingDistrict}
            >
              {districts.map((d) => (
                <MenuItem key={d} value={d}>
                  {d}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              required
              label="Status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <MenuItem value="Active">Active</MenuItem>
              <MenuItem value="Inactive">Inactive</MenuItem>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setFormOpen(false)} disabled={saving} variant="outlined" sx={{ borderRadius: 2 }}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving} variant="contained" sx={{ borderRadius: 2 }}>
            {saving ? 'Saving...' : editing ? 'Update Voter' : 'Register Voter'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Voter Details
          <IconButton onClick={() => setViewOpen(false)} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selected && (
            <Box sx={{ textAlign: 'center' }}>
              <Avatar
                src={selected.idPhoto}
                sx={{ width: 80, height: 80, mx: 'auto', mb: 2 }}
              />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {selected.name}
              </Typography>
              <Chip
                label={selected.status}
                size="small"
                color={selected.status === 'Active' ? 'success' : 'error'}
                sx={{ mt: 1 }}
              />
              <Box sx={{ mt: 2, textAlign: 'left' }}>
                <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                  <Typography sx={{ fontWeight: 600, minWidth: 120 }}>Voter ID:</Typography>
                  <Typography sx={{ fontFamily: 'monospace' }}>{selected.voterId}</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                  <Typography sx={{ fontWeight: 600, minWidth: 120 }}>Email:</Typography>
                  <Typography>{selected.email}</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                  <Typography sx={{ fontWeight: 600, minWidth: 120 }}>District:</Typography>
                  <Typography>{selected.pollingDistrict}</Typography>
                </Box>
              </Box>
              <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, textAlign: 'left' }}>
                <UploadedDocumentPreview label="ID photo" src={selected.idPhoto} alt={`${selected.name} ID photo`} />
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
              {selected?.status === 'Inactive' ? 'Activate' : 'Deactivate'} voter <strong>{selected?.name}</strong>? Existing voting records will be preserved.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteOpen(false)} variant="outlined" sx={{ borderRadius: 2 }}>
            Cancel
          </Button>
          <Button onClick={handleDelete} variant="contained" color={selected?.status === 'Inactive' ? 'success' : 'error'} sx={{ borderRadius: 2 }}>
            {selected?.status === 'Inactive' ? 'Activate Voter' : 'Deactivate Voter'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={permanentDeleteOpen} onClose={() => setPermanentDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Permanently delete voter?</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, borderRadius: 2, bgcolor: 'error.main', color: '#fff', mb: 2, opacity: 0.9 }}>
            <Warning />
            <Typography variant="body2">
              Delete <strong>{selected?.name}</strong> permanently? This is allowed only because the voter has not cast a vote. The account and uploaded documents will be removed.
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
