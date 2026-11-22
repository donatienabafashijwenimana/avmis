import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import { apiRequest } from '../lib/api';
import ListToolbar from '../components/ListToolbar';

export default function ElectionRecordsPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('name-asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    const loadRecords = () => apiRequest('/elections.php')
      .then((response) => setRecords(response.elections || []))
      .catch((requestError) => setError(requestError.message || 'Election records could not be loaded.'))
      .finally(() => setLoading(false));
    loadRecords();
    const interval = window.setInterval(loadRecords, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = records.filter((record) => (
      (!query || [record.name, record.position, record.status].some((value) => String(value || '').toLowerCase().includes(query)))
      && (!statusFilter || record.status === statusFilter)
    ));
    return rows.sort((left, right) => {
      const [field, direction] = sort.split('-');
      const leftValue = field === 'votes' ? Number(left.voteCount || 0) : left[field] || '';
      const rightValue = field === 'votes' ? Number(right.voteCount || 0) : right[field] || '';
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number' ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue));
      return direction === 'desc' ? -comparison : comparison;
    });
  }, [records, search, sort, statusFilter]);
  const statuses = [...new Set(records.map((record) => record.status).filter(Boolean))].sort();
  const safePage = Math.min(page, Math.max(0, Math.ceil(visibleRecords.length / rowsPerPage) - 1));
  const paginatedRecords = visibleRecords.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);

  return (
    <Box className="print-table-page">
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Election Records</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Election events are separate from the individual vote transactions stored in the votes table.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? <CircularProgress /> : (
        <Card sx={{ borderRadius: 3 }}>
          <CardContent>
            <ListToolbar search={search} onSearch={(value) => { setSearch(value); setPage(0); }} searchLabel="Search records" filter={statusFilter} onFilter={(value) => { setStatusFilter(value); setPage(0); }} filterLabel="Status" filterOptions={[{ value: '', label: 'All statuses' }, ...statuses.map((value) => ({ value, label: value }))]} sort={sort} onSort={(value) => { setSort(value); setPage(0); }} sortOptions={[{ value: 'name-asc', label: 'Name (A–Z)' }, { value: 'name-desc', label: 'Name (Z–A)' }, { value: 'votes-desc', label: 'Most votes' }]} onPrint={() => window.print()} />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Election</TableCell>
                    <TableCell>Position</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Votes recorded</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody className="screen-table-body">
                  {paginatedRecords.map((record) => (
                    <TableRow key={record.id} hover>
                      <TableCell>{record.name}</TableCell>
                      <TableCell>{record.position}</TableCell>
                      <TableCell>{record.status}</TableCell>
                      <TableCell align="right">{record.voteCount}</TableCell>
                    </TableRow>
                  ))}
                  {!visibleRecords.length && (
                    <TableRow><TableCell colSpan={4}>{records.length ? 'No records match the current filters.' : 'No election records yet.'}</TableCell></TableRow>
                  )}
                </TableBody>
                <TableBody className="print-table-body">
                  {visibleRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{record.name}</TableCell>
                      <TableCell>{record.position}</TableCell>
                      <TableCell>{record.status}</TableCell>
                      <TableCell align="right">{record.voteCount}</TableCell>
                    </TableRow>
                  ))}
                  {!visibleRecords.length && <TableRow><TableCell colSpan={4}>{records.length ? 'No records match the current filters.' : 'No election records yet.'}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
            {visibleRecords.length > 0 && <TablePagination component="div" count={visibleRecords.length} page={safePage} onPageChange={(_, nextPage) => setPage(nextPage)} rowsPerPage={rowsPerPage} onRowsPerPageChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[5, 10, 25]} />}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
