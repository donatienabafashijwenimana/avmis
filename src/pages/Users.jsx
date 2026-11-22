import { useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Close, Edit, PhotoCamera, Print as PrintIcon, Visibility } from '@mui/icons-material';
import { useDataStore } from '../stores/dataStore';
import TableActions from '../components/TableActions';
import UploadedDocumentPreview from '../components/UploadedDocumentPreview';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  pollingDistrict: '',
  status: 'Active',
  idPhoto: '',
  nationalIdDocument: '',
};

const roleLabel = (role) => role === 'admin' ? 'Administrator' : role === 'candidate' ? 'Candidate' : 'Voter';

export default function UsersPage() {
  const users = useDataStore((state) => state.users);
  const updateUser = useDataStore((state) => state.updateUser);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [photoPreview, setPhotoPreview] = useState('');
  const [nationalIdPreview, setNationalIdPreview] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState('');

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => [
      user.name,
      user.email,
      user.username,
      user.voterId,
      user.role,
      user.status,
    ].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [search, users]);

  const openEdit = (user) => {
    setEditing(user);
    setForm({
      name: user.name || '',
      email: user.email || '',
      password: '',
      pollingDistrict: user.pollingDistrict || '',
      status: user.status || 'Active',
      idPhoto: user.idPhoto || '',
      nationalIdDocument: user.nationalIdDocument || '',
    });
    setPhotoPreview(user.idPhoto || '');
    setNationalIdPreview(user.nationalIdDocument || '');
    setFormErrors({});
    setPageError('');
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setFormErrors((previous) => ({ ...previous, idPhoto: 'Only JPEG/PNG files are allowed.' }));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFormErrors((previous) => ({ ...previous, idPhoto: 'File must be under 2MB.' }));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result);
      setForm((previous) => ({ ...previous, idPhoto: reader.result }));
      setFormErrors((previous) => ({ ...previous, idPhoto: '' }));
    };
    reader.readAsDataURL(file);
  };

  const handleNationalIdChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setFormErrors((previous) => ({ ...previous, nationalIdDocument: 'Only JPEG/PNG files are allowed.' }));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFormErrors((previous) => ({ ...previous, nationalIdDocument: 'File must be under 2MB.' }));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setNationalIdPreview(reader.result);
      setForm((previous) => ({ ...previous, nationalIdDocument: reader.result }));
      setFormErrors((previous) => ({ ...previous, nationalIdDocument: '' }));
    };
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Name is required.';
    if (!form.email.trim()) {
      errors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = 'Enter a valid email address.';
    }
    if (form.password) {
      const checks = [];
      if (form.password.length < 8) checks.push('8+ characters');
      if (!/[A-Z]/.test(form.password)) checks.push('uppercase letter');
      if (!/[0-9]/.test(form.password)) checks.push('number');
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(form.password)) checks.push('special character');
      if (checks.length) errors.password = `Add: ${checks.join(', ')}`;
    }
    if (editing.role !== 'admin' && !form.nationalIdDocument) errors.nationalIdDocument = 'National ID document is required.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !editing) return;
    setSaving(true);
    setPageError('');
    try {
      const payload = {
        name: form.name,
        email: form.email,
        status: form.status,
        idPhoto: photoPreview || '',
        nationalIdDocument: nationalIdPreview || '',
      };
      if (editing.role === 'voter') payload.pollingDistrict = form.pollingDistrict;
      if (form.password) payload.password = form.password;
      await updateUser(editing.id, payload);
      setEditing(null);
    } catch (error) {
      setPageError(error.message || 'User could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      field: 'idPhoto',
      headerName: '',
      width: 56,
      sortable: false,
      filterable: false,
      renderCell: (params) => <Avatar src={params.row.idPhoto} sx={{ width: 32, height: 32 }}>{params.row.name?.charAt(0)}</Avatar>,
    },
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 160 },
    { field: 'email', headerName: 'Email', flex: 1, minWidth: 210 },
    {
      field: 'identity',
      headerName: 'Username / Voter ID',
      flex: 1,
      minWidth: 170,
      valueGetter: (_, row) => row.username || row.voterId || '—',
    },
    {
      field: 'role',
      headerName: 'Role',
      width: 135,
      renderCell: (params) => <Chip label={roleLabel(params.value)} size="small" color={params.value === 'admin' ? 'success' : params.value === 'candidate' ? 'secondary' : 'primary'} />,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      renderCell: (params) => <Chip label={params.value} size="small" color={params.value === 'Active' ? 'success' : 'default'} />,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 135,
      sortable: false,
      filterable: false,
      renderCell: (params) => <TableActions actions={[{ key: 'view', label: 'Preview uploaded documents', icon: <Visibility fontSize="small" />, onClick: () => setViewing(params.row) }, { key: 'edit', label: 'Edit user', icon: <Edit fontSize="small" />, onClick: () => openEdit(params.row) }]} />,
    },
  ];

  return (
    <Box className="print-table-page">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>User Management</Typography>
          <Typography color="text.secondary">Administrators can manage every account. Users can edit their own profile.</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField size="small" label="Search users" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ minWidth: 240 }} />
          <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => window.print()}>Print List</Button>
        </Box>
      </Box>
      {pageError && <Alert severity="error" sx={{ mb: 2 }}>{pageError}</Alert>}
      <Card sx={{ borderRadius: 3 }}>
        <DataGrid
          rows={filteredUsers}
          columns={columns}
          autoHeight
          disableRowSelectionOnClick
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
          sx={{ border: 0, minHeight: 320 }}
        />
      </Card>

      <table className="print-only-table">
        <thead><tr><th>Name</th><th>Email</th><th>Username / Voter ID</th><th>Role</th><th>Status</th></tr></thead>
        <tbody>{filteredUsers.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td>{user.username || user.voterId || '—'}</td><td>{roleLabel(user.role)}</td><td>{user.status}</td></tr>)}</tbody>
      </table>

      <Dialog open={Boolean(viewing)} onClose={() => setViewing(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {viewing ? `${roleLabel(viewing.role)} Documents` : 'Uploaded Documents'}
          <IconButton onClick={() => setViewing(null)} size="small"><Close /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {viewing && (
            <>
              <Typography variant="h6" sx={{ mb: 0.5 }}>{viewing.name}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{viewing.email}</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <UploadedDocumentPreview label="Profile / ID photo" src={viewing.idPhoto} alt={`${viewing.name} profile photo`} />
                <UploadedDocumentPreview label="National ID document" src={viewing.nationalIdDocument} alt={`${viewing.name} National ID document`} />
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setViewing(null)}>Close</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(editing)} onClose={() => !saving && setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Edit {editing ? roleLabel(editing.role) : 'User'}
          <IconButton onClick={() => setEditing(null)} disabled={saving}><Close /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {editing && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {editing.username || editing.voterId || 'Account'} · {roleLabel(editing.role)}
            </Typography>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <Avatar src={photoPreview} sx={{ width: 88, height: 88, fontSize: '2rem' }}>{form.name?.charAt(0)}</Avatar>
          </Box>
          <Button variant="outlined" component="label" startIcon={<PhotoCamera />} fullWidth sx={{ mb: 2 }}>
            Change profile photo
            <input hidden type="file" accept="image/jpeg,image/png" onChange={handlePhotoChange} />
          </Button>
          {formErrors.idPhoto && <Alert severity="error" sx={{ mb: 2 }}>{formErrors.idPhoto}</Alert>}
          {editing?.role !== 'admin' && nationalIdPreview && <UploadedDocumentPreview label="Current National ID document" src={nationalIdPreview} alt="Current National ID document" />}
          {editing?.role !== 'admin' && (
            <>
              <Button variant="outlined" component="label" startIcon={<PhotoCamera />} fullWidth sx={{ mb: 1 }}>
                Upload National ID
                <input hidden required={!form.nationalIdDocument} type="file" accept="image/jpeg,image/png" onChange={handleNationalIdChange} />
              </Button>
              {formErrors.nationalIdDocument && <Alert severity="error" sx={{ mb: 2 }}>{formErrors.nationalIdDocument}</Alert>}
            </>
          )}
          <TextField fullWidth required label="Full name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} error={!!formErrors.name} helperText={formErrors.name} sx={{ mb: 2 }} />
          <TextField fullWidth required type="email" label="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} error={!!formErrors.email} helperText={formErrors.email} sx={{ mb: 2 }} />
          <TextField fullWidth label="New password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} error={!!formErrors.password} helperText={formErrors.password || 'Leave blank to keep the current password.'} sx={{ mb: 2 }} />
          {editing?.role === 'voter' && <TextField fullWidth label="Polling district" value={form.pollingDistrict} onChange={(event) => setForm({ ...form, pollingDistrict: event.target.value })} sx={{ mb: 2 }} />}
          <TextField select fullWidth label="Account status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            <MenuItem value="Active">Active</MenuItem>
            <MenuItem value="Inactive">Inactive</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
