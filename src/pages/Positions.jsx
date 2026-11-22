import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
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
import { Add, Delete, Edit, HowToVote, Visibility } from '@mui/icons-material';
import { IconButton } from '@mui/material';
import { useDataStore } from '../stores/dataStore';
import { apiRequest } from '../lib/api';
import { toast } from 'react-toastify';
import TableActions from '../components/TableActions';
import ListToolbar from '../components/ListToolbar';

const emptyPosition = {
  name: '',
  category: 'National',
  criteria: '',
  requiredDocuments: '',
};

export default function PositionsPage() {
  const candidates = useDataStore((state) => state.candidates);
  const availablePositions = useDataStore((state) => state.positions);
  const addPosition = useDataStore((state) => state.addPosition);
  const updatePosition = useDataStore((state) => state.updatePosition);
  const deletePosition = useDataStore((state) => state.deletePosition);
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState(null);
  const [form, setForm] = useState(emptyPosition);
  const [saving, setSaving] = useState(false);
  const [applications, setApplications] = useState([]);
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sort, setSort] = useState('name-asc');

  useEffect(() => {
    const loadApplications = () => apiRequest('/applications.php')
      .then((response) => setApplications(response.applications || []))
      .catch(() => toast.error('Position data could not be loaded.'))
      .finally(() => setApplicationsLoading(false));
    loadApplications();
    const interval = window.setInterval(loadApplications, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const completedApplicationKeys = useMemo(
    () => new Set(
      applications
        .filter((application) => application.status === 'Approved')
        .map((application) => `${application.positionId}:${application.candidateId}`)
    ),
    [applications]
  );

  const positionRows = useMemo(
    () => availablePositions.map((position) => ({
      position,
      completedCandidateCount: candidates.filter((candidate) => (
        candidate.status !== 'Inactive'
        && completedApplicationKeys.has(`${position.id}:${candidate.id}`)
      )).length,
    })),
    [availablePositions, candidates, completedApplicationKeys]
  );
  const visiblePositionRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = positionRows.filter(({ position }) => {
      const matchesSearch = !query || [position.name, position.category, position.criteria, position.requiredDocuments]
        .some((value) => String(value || '').toLowerCase().includes(query));
      return matchesSearch && (!categoryFilter || position.category === categoryFilter);
    });
    return rows.sort((left, right) => {
      const [field, direction] = sort.split('-');
      const leftValue = field === 'candidates' ? left.completedCandidateCount : left.position[field] || '';
      const rightValue = field === 'candidates' ? right.completedCandidateCount : right.position[field] || '';
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue));
      return direction === 'desc' ? -comparison : comparison;
    });
  }, [categoryFilter, positionRows, search, sort]);
  const categories = [...new Set(positionRows.map(({ position }) => position.category).filter(Boolean))].sort();
  const safePage = Math.min(page, Math.max(0, Math.ceil(visiblePositionRows.length / rowsPerPage) - 1));
  const paginatedPositionRows = visiblePositionRows.slice(
    safePage * rowsPerPage,
    safePage * rowsPerPage + rowsPerPage,
  );

  const openCreateDialog = () => {
    setEditingPosition(null);
    setForm(emptyPosition);
    setDialogOpen(true);
  };

  const openEditDialog = (position) => {
    setEditingPosition(position);
    setForm({
      name: position.name,
      category: position.category,
      criteria: position.criteria || '',
      requiredDocuments: position.requiredDocuments || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.category.trim() || !form.criteria.trim() || !form.requiredDocuments.trim()) {
      toast.error('Name, category, eligibility criteria, and required documents are required.');
      return;
    }
    setSaving(true);
    try {
      if (editingPosition) {
        await updatePosition(editingPosition.id, form);
        toast.success('Position updated successfully.');
      } else {
        await addPosition(form);
        toast.success('Position added successfully.');
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error(error.message || 'The position could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePosition(deleteTarget.id);
      setDeleteTarget(null);
      setSelectedDetails(null);
      toast.success('Position deleted successfully.');
    } catch (error) {
      toast.error(error.message || 'The position could not be deleted.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box className="print-table-page">
      <Box
        className="print-hide"
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Positions
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Review election positions and the number of eligible candidates.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={openCreateDialog}
          sx={{ borderRadius: 2 }}
        >
          Add Position
        </Button>
      </Box>

      {applicationsLoading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">Loading candidates...</Typography>
        </Box>
      )}

      {positionRows.length === 0 ? (
        <Card sx={{ borderRadius: 3 }}>
          <CardContent>
            <Typography color="text.secondary">
              No positions are available to display.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card className="screen-positions-card" sx={{ borderRadius: 3, border: '1px solid #c8e6c9' }}>
          <CardContent sx={{ pb: 0 }}>
            <ListToolbar
              search={search}
              onSearch={(value) => { setSearch(value); setPage(0); }}
              searchLabel="Search positions"
              filter={categoryFilter}
              onFilter={(value) => { setCategoryFilter(value); setPage(0); }}
              filterLabel="Category"
              filterOptions={[{ value: '', label: 'All categories' }, ...categories.map((value) => ({ value, label: value }))]}
              sort={sort}
              onSort={(value) => { setSort(value); setPage(0); }}
              sortOptions={[
                { value: 'name-asc', label: 'Name (A–Z)' },
                { value: 'name-desc', label: 'Name (Z–A)' },
                { value: 'category-asc', label: 'Category' },
                { value: 'candidates-desc', label: 'Most candidates' },
              ]}
              onPrint={() => window.print()}
            />
          </CardContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Position</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Criteria</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Required documents</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Completed candidates</TableCell>
                  <TableCell align="right" className="print-hide" sx={{ fontWeight: 700 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody className="screen-table-body">
                {paginatedPositionRows.map(({ position, completedCandidateCount }) => (
                  <TableRow key={position.id} hover>
                    <TableCell>{position.name}</TableCell>
                    <TableCell>{position.category}</TableCell>
                    <TableCell>
                      <Typography color={position.status === 'Active' ? 'success.main' : 'text.secondary'}>
                        {position.status}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ minWidth: 220, maxWidth: 320, whiteSpace: 'pre-line' }}>
                      {position.criteria || 'Not recorded'}
                    </TableCell>
                    <TableCell sx={{ minWidth: 220, maxWidth: 320, whiteSpace: 'pre-line' }}>
                      {position.requiredDocuments || 'Not recorded'}
                    </TableCell>
                    <TableCell>{completedCandidateCount}</TableCell>
                    <TableCell align="right" className="print-hide">
                      <TableActions actions={[
                        { key: 'details', label: 'View position details', icon: <Visibility fontSize="small" />, onClick: () => setSelectedDetails({ position, completedCandidateCount }) },
                        { key: 'edit', label: 'Edit position', icon: <Edit fontSize="small" />, onClick: () => openEditDialog(position) },
                        { key: 'delete', label: 'Delete position', icon: <Delete fontSize="small" />, color: 'error', onClick: () => setDeleteTarget(position) },
                      ]} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableBody className="print-table-body">
                {visiblePositionRows.map(({ position, completedCandidateCount }) => (
                  <TableRow key={position.id}>
                    <TableCell>{position.name}</TableCell>
                    <TableCell>{position.category}</TableCell>
                    <TableCell>{position.status}</TableCell>
                    <TableCell sx={{ whiteSpace: 'pre-line' }}>{position.criteria || 'Not recorded'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'pre-line' }}>{position.requiredDocuments || 'Not recorded'}</TableCell>
                    <TableCell>{completedCandidateCount}</TableCell>
                  </TableRow>
                ))}
                {!visiblePositionRows.length && <TableRow><TableCell colSpan={6} align="center">No positions match the current filters.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={visiblePositionRows.length}
            page={safePage}
            onPageChange={(_, nextPage) => setPage(nextPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(Number(event.target.value));
              setPage(0);
            }}
            rowsPerPageOptions={[5, 10, 25]}
          />
        </Card>
      )}

      <table className="print-only-table">
        <caption>All filtered election positions</caption>
        <thead>
          <tr>
            <th>Position</th>
            <th>Category</th>
            <th>Status</th>
            <th>Eligibility criteria</th>
            <th>Required documents</th>
            <th>Completed candidates</th>
          </tr>
        </thead>
        <tbody>
          {visiblePositionRows.map(({ position, completedCandidateCount }) => (
            <tr key={position.id}>
              <td>{position.name}</td>
              <td>{position.category}</td>
              <td>{position.status}</td>
              <td>{position.criteria || 'Not recorded'}</td>
              <td>{position.requiredDocuments || 'Not recorded'}</td>
              <td>{completedCandidateCount}</td>
            </tr>
          ))}
          {!visiblePositionRows.length && (
            <tr><td colSpan="6">No positions match the current filters.</td></tr>
          )}
        </tbody>
      </table>

      <Button
        variant="text"
        startIcon={<HowToVote />}
        onClick={() => navigate('/candidates')}
        sx={{ mt: 3 }}
      >
        Manage candidates and requirements
      </Button>

      <Dialog
        open={Boolean(selectedDetails)}
        onClose={() => setSelectedDetails(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Position details</DialogTitle>
        <DialogContent dividers>
          {selectedDetails && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#1b5e20' }}>
                {selectedDetails.position.name}
              </Typography>

              <Divider sx={{ my: 2 }} />
              <Typography variant="body2"><strong>Category:</strong> {selectedDetails.position.category}</Typography>
              <Typography variant="body2" sx={{ mt: 1 }}><strong>Status:</strong> {selectedDetails.position.status}</Typography>
              <Typography variant="body2" sx={{ mt: 1 }}><strong>Completed candidates:</strong> {selectedDetails.completedCandidateCount}</Typography>

              <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 700 }}>Eligibility criteria</Typography>
              <Typography variant="body2">{selectedDetails.position.criteria || 'Not recorded'}</Typography>

              <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 700 }}>Required documents</Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {(selectedDetails.position.requiredDocuments || '').split(/\r?\n/).filter(Boolean).map((document) => (
                  <Typography component="li" variant="body2" key={document}>{document}</Typography>
                ))}
              </Box>

            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedDetails(null)}>Close</Button>
          {selectedDetails && (
            <>
              <Button
                startIcon={<Edit />}
                onClick={() => {
                  setSelectedDetails(null);
                  openEditDialog(selectedDetails.position);
                }}
              >
                Edit position
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingPosition ? 'Edit position' : 'Add position'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            required
            label="Position name"
            inputProps={{ maxLength: 120 }}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            select
            fullWidth
            required
            label="Category"
            value={form.category}
            onChange={(event) => setForm({ ...form, category: event.target.value })}
            sx={{ mb: 2 }}
          >
            {['National', 'Regional', 'District', 'Sector'].map((category) => (
              <MenuItem key={category} value={category}>{category}</MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            required
            label="Eligibility criteria"
            inputProps={{ maxLength: 3000 }}
            value={form.criteria}
            onChange={(event) => setForm({ ...form, criteria: event.target.value })}
            multiline
            minRows={3}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            required
            label="Required documents"
            inputProps={{ maxLength: 2000 }}
            value={form.requiredDocuments}
            onChange={(event) => setForm({ ...form, requiredDocuments: event.target.value })}
            multiline
            minRows={4}
            helperText="Enter one document per line for this position."
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save position'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onClose={() => !deleting && setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete position?</DialogTitle>
        <DialogContent>
          <Typography>
            Delete <strong>{deleteTarget?.name}</strong>? It will be removed from the active position list.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
