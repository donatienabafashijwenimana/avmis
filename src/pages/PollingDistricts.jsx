import { useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Table, TableBody, TableCell, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material';
import { Add, Close, Delete, Edit, Block, CheckCircle } from '@mui/icons-material';
import { useDataStore } from '../stores/dataStore';
import TableActions from '../components/TableActions';
import ListToolbar from '../components/ListToolbar';

const blank = { name: '', code: '', status: 'Active' };

export default function PollingDistrictsPage() {
  const districts = useDataStore((state) => state.districts);
  const addDistrict = useDataStore((state) => state.addDistrict);
  const updateDistrict = useDataStore((state) => state.updateDistrict);
  const deleteDistrict = useDataStore((state) => state.deleteDistrict);
  const [form, setForm] = useState(blank); const [editing, setEditing] = useState(null); const [open, setOpen] = useState(false); const [error, setError] = useState('');
  const [page, setPage] = useState(0); const [rowsPerPage, setRowsPerPage] = useState(10);
  const [search, setSearch] = useState(''); const [statusFilter, setStatusFilter] = useState(''); const [sort, setSort] = useState('name-asc');
  const visibleDistricts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = districts.filter((district) => (
      (!query || [district.name, district.code].some((value) => String(value || '').toLowerCase().includes(query)))
      && (!statusFilter || district.status === statusFilter)
    ));
    return rows.sort((left, right) => {
      const [field, direction] = sort.split('-');
      const comparison = field === 'voters' ? Number(left.voterCount || 0) - Number(right.voterCount || 0) : String(left[field] || '').localeCompare(String(right[field] || ''));
      return direction === 'desc' ? -comparison : comparison;
    });
  }, [districts, search, sort, statusFilter]);
  const safePage = Math.min(page, Math.max(0, Math.ceil(visibleDistricts.length / rowsPerPage) - 1));
  const paginatedDistricts = visibleDistricts.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);
  const openForm = (district = null) => { setEditing(district); setForm(district ? { name: district.name, code: district.code, status: district.status } : blank); setError(''); setOpen(true); };
  const save = async () => { if (!form.name.trim() || !form.code.trim()) { setError('District name and code are required.'); return; } try { if (editing) await updateDistrict(editing.id, form); else await addDistrict(form); setOpen(false); } catch (requestError) { setError(requestError.message || 'District could not be saved.'); } };
  const toggleStatus = async (district) => { const nextStatus = district.status === 'Inactive' ? 'Active' : 'Inactive'; if (!window.confirm(`${nextStatus === 'Active' ? 'Activate' : 'Deactivate'} ${district.name}?`)) return; try { await updateDistrict(district.id, { name: district.name, code: district.code, status: nextStatus }); } catch (requestError) { setError(requestError.message || 'District status could not be changed.'); } };
  const remove = async (district) => { if (!window.confirm(`Delete ${district.name}? Voters assigned to it will keep their accounts but lose this district assignment.`)) return; try { await deleteDistrict(district.id); } catch (requestError) { setError(requestError.message || 'District could not be deleted.'); } };
  return <Box className="print-table-page"><Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, gap: 2 }}><Box><Typography variant="h5" sx={{ fontWeight: 700 }}>Polling Districts</Typography><Typography color="text.secondary">Manage districts and monitor assigned voters.</Typography></Box><Button variant="contained" startIcon={<Add />} onClick={() => openForm()}>Add District</Button></Box>
    <Card><CardContent><ListToolbar search={search} onSearch={(value) => { setSearch(value); setPage(0); }} searchLabel="Search districts" filter={statusFilter} onFilter={(value) => { setStatusFilter(value); setPage(0); }} filterLabel="Status" filterOptions={[{ value: '', label: 'All statuses' }, { value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]} sort={sort} onSort={(value) => { setSort(value); setPage(0); }} sortOptions={[{ value: 'name-asc', label: 'Name (A–Z)' }, { value: 'name-desc', label: 'Name (Z–A)' }, { value: 'voters-desc', label: 'Most voters' }]} onPrint={() => window.print()} /><Table><TableHead><TableRow><TableCell>District</TableCell><TableCell>Code</TableCell><TableCell>Registered voters</TableCell><TableCell>Status</TableCell><TableCell align="right" className="print-hide">Actions</TableCell></TableRow></TableHead><TableBody className="screen-table-body">{paginatedDistricts.map((district) => <TableRow key={district.id}><TableCell>{district.name}</TableCell><TableCell>{district.code}</TableCell><TableCell>{district.voterCount}</TableCell><TableCell><Chip size="small" label={district.status} color={district.status === 'Active' ? 'success' : 'default'} /></TableCell><TableCell align="right" className="print-hide"><TableActions actions={[{ key: 'edit', label: 'Edit district', icon: <Edit fontSize="small" />, onClick: () => openForm(district) }, { key: 'status', label: district.status === 'Inactive' ? 'Activate district' : 'Deactivate district', icon: district.status === 'Inactive' ? <CheckCircle fontSize="small" /> : <Block fontSize="small" />, color: district.status === 'Inactive' ? 'success' : 'warning', onClick: () => toggleStatus(district) }, { key: 'delete', label: 'Delete district', icon: <Delete fontSize="small" />, color: 'error', onClick: () => remove(district) }]} /></TableCell></TableRow>)}{!visibleDistricts.length && <TableRow><TableCell colSpan={5} align="center">{districts.length ? 'No districts match the current filters.' : 'No polling districts have been created.'}</TableCell></TableRow>}</TableBody><TableBody className="print-table-body">{visibleDistricts.map((district) => <TableRow key={district.id}><TableCell>{district.name}</TableCell><TableCell>{district.code}</TableCell><TableCell>{district.voterCount}</TableCell><TableCell>{district.status}</TableCell></TableRow>)}{!visibleDistricts.length && <TableRow><TableCell colSpan={4} align="center">{districts.length ? 'No districts match the current filters.' : 'No polling districts have been created.'}</TableCell></TableRow>}</TableBody></Table>{visibleDistricts.length > 0 && <TablePagination component="div" count={visibleDistricts.length} page={safePage} onPageChange={(_, nextPage) => setPage(nextPage)} rowsPerPage={rowsPerPage} onRowsPerPageChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[5, 10, 25]} />}</CardContent></Card>
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs"><DialogTitle>{editing ? 'Update District' : 'Add District'}<IconButton onClick={() => setOpen(false)} sx={{ float: 'right' }}><Close /></IconButton></DialogTitle><DialogContent>{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}<TextField required fullWidth autoFocus label="District name" inputProps={{ maxLength: 120 }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ mt: 1, mb: 2 }} /><TextField required fullWidth label="Code" inputProps={{ maxLength: 32 }} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} /></DialogContent><DialogActions><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="contained" onClick={save}>Save</Button></DialogActions></Dialog>
  </Box>;
}
