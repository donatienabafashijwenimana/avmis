import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, Table, TableBody, TableCell, TableHead, TablePagination, TableRow, Typography,
} from '@mui/material';
import { Assignment, Close, Edit, Visibility } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { apiRequest } from '../lib/api';
import TableActions from '../components/TableActions';
import ListToolbar from '../components/ListToolbar';

const statusColor = { Pending: 'warning', Approved: 'success', Rejected: 'error' };
const dateValue = (value) => (value ? new Date(value.replace(' ', 'T')).getTime() : null);

const applicationWindowOpen = (application, now = Date.now()) => {
  if (!application?.electionId || !['Draft', 'Open'].includes(application.electionStatus)) return false;
  if (application.applicationStatus === 'Closed') return false;
  if (application.applicationStatus === 'Open') return true;
  const starts = dateValue(application.applicationStartsAt);
  const ends = dateValue(application.applicationEndsAt);
  return (!starts || starts <= now) && (!ends || ends > now);
};

const canEditApplication = (application) => (
  application?.status !== 'Approved' && applicationWindowOpen(application)
);

const getApplicationResult = (application, publishedResults) => {
  if (application.status === 'Rejected') return { label: 'Failed', color: 'error' };
  const result = publishedResults.find((item) => item.id === application.electionId);
  if (!result) return { label: 'Pending result', color: 'warning' };
  const winner = result.candidates?.[0];
  if (!winner) return { label: 'No winner', color: 'default' };
  return winner.id === application.candidateId
    ? { label: 'Won', color: 'success' }
    : { label: 'Failed', color: 'error' };
};

export default function CandidateApplicationsPage() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [publishedResults, setPublishedResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('submitted-desc');

  useEffect(() => {
    const loadCandidateData = () => Promise.allSettled([apiRequest('/applications.php'), apiRequest('/results.php')])
      .then(([applicationResult, resultsResult]) => {
        if (applicationResult.status === 'fulfilled') {
          setApplications(applicationResult.value.applications || []);
        } else {
          toast.error(applicationResult.reason.message || 'Applications could not be loaded.');
        }
        if (resultsResult.status === 'fulfilled') {
          setPublishedResults(resultsResult.value.elections || []);
        }
      })
      .finally(() => setLoading(false));
    loadCandidateData();
    const interval = window.setInterval(loadCandidateData, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const visibleApplications = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = applications.filter((application) => (
      (!query || [application.electionName, application.position, application.status]
        .some((value) => String(value || '').toLowerCase().includes(query)))
      && (!statusFilter || application.status === statusFilter)
    ));
    return rows.sort((left, right) => {
      const [field, direction] = sort.split('-');
      const leftValue = field === 'submitted' ? new Date(left.submittedAt || 0).getTime() : field === 'election' ? left.electionName || '' : left[field] || '';
      const rightValue = field === 'submitted' ? new Date(right.submittedAt || 0).getTime() : field === 'election' ? right.electionName || '' : right[field] || '';
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number' ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue));
      return direction === 'desc' ? -comparison : comparison;
    });
  }, [applications, search, sort, statusFilter]);
  const safePage = Math.min(page, Math.max(0, Math.ceil(visibleApplications.length / rowsPerPage) - 1));
  const paginatedApplications = visibleApplications.slice(
    safePage * rowsPerPage,
    safePage * rowsPerPage + rowsPerPage,
  );
  const previewType = previewDocument?.type || previewDocument?.data?.match(/^data:([^;,]+)/)?.[1] || '';
  const previewIsImage = previewType.startsWith('image/');
  const previewIsPdf = previewType === 'application/pdf';

  return (
    <Box className="print-table-page">
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Your Application</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>View the applications you submitted and their review status.</Typography>
      <Card sx={{ borderRadius: 3 }}><CardContent>
        {loading ? <CircularProgress /> : <><ListToolbar search={search} onSearch={(value) => { setSearch(value); setPage(0); }} searchLabel="Search applications" filter={statusFilter} onFilter={(value) => { setStatusFilter(value); setPage(0); }} filterLabel="Status" filterOptions={[{ value: '', label: 'All statuses' }, ...Object.keys(statusColor).map((value) => ({ value, label: value }))]} sort={sort} onSort={(value) => { setSort(value); setPage(0); }} sortOptions={[{ value: 'submitted-desc', label: 'Newest submitted' }, { value: 'submitted-asc', label: 'Oldest submitted' }, { value: 'election-asc', label: 'Election (A–Z)' }, { value: 'position-asc', label: 'Position (A–Z)' }]} onPrint={() => window.print()} /><Table size="small"><TableHead><TableRow><TableCell>Election</TableCell><TableCell>Position</TableCell><TableCell>Status</TableCell><TableCell>Result</TableCell><TableCell>Submitted</TableCell><TableCell align="right" className="print-hide">Details</TableCell></TableRow></TableHead><TableBody className="screen-table-body">
          {paginatedApplications.map((application) => { const result = getApplicationResult(application, publishedResults); return <TableRow key={application.id} hover><TableCell>{application.electionName || 'Election application'}</TableCell><TableCell>{application.position}</TableCell><TableCell><Chip size="small" label={application.status} color={statusColor[application.status] || 'default'} /></TableCell><TableCell><Chip size="small" label={result.label} color={result.color} /></TableCell><TableCell>{application.submittedAt}</TableCell><TableCell align="right" className="print-hide"><TableActions actions={[{ key: 'details', label: 'View application details', icon: <Visibility fontSize="small" />, onClick: () => setSelected(application) }, { key: 'edit', label: 'Edit application', icon: <Edit fontSize="small" />, color: 'primary', show: canEditApplication(application), onClick: () => navigate(`/candidate/positions/apply/${application.electionId}`) }]} /></TableCell></TableRow>; })}
          {!visibleApplications.length && <TableRow><TableCell colSpan={6} align="center"><Box sx={{ py: 3 }}><Typography color="text.secondary" sx={{ mb: 2 }}>{applications.length ? 'No applications match the current filters.' : 'You have not submitted an application yet.'}</Typography>{!applications.length && <Button variant="contained" startIcon={<Assignment />} onClick={() => navigate('/candidate/positions')}>Browse available positions</Button>}</Box></TableCell></TableRow>}
        </TableBody><TableBody className="print-table-body">
          {visibleApplications.map((application) => { const result = getApplicationResult(application, publishedResults); return <TableRow key={application.id}><TableCell>{application.electionName || 'Election application'}</TableCell><TableCell>{application.position}</TableCell><TableCell>{application.status}</TableCell><TableCell>{result.label}</TableCell><TableCell>{application.submittedAt}</TableCell></TableRow>; })}
          {!visibleApplications.length && <TableRow><TableCell colSpan={5} align="center">No applications match the current filters.</TableCell></TableRow>}
        </TableBody></Table>{visibleApplications.length > 0 && <TablePagination component="div" count={visibleApplications.length} page={safePage} onPageChange={(_, nextPage) => setPage(nextPage)} rowsPerPage={rowsPerPage} onRowsPerPageChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[5, 10, 25]} />}</>}
      </CardContent></Card>
      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="sm">
        <DialogTitle>Application details<IconButton onClick={() => setSelected(null)} sx={{ float: 'right' }}><Close /></IconButton></DialogTitle>
        <DialogContent>{selected && <><Typography><strong>Position:</strong> {selected.position}</Typography><Typography><strong>Status:</strong> {selected.status}</Typography><Typography><strong>Result:</strong> {getApplicationResult(selected, publishedResults).label}</Typography><Typography><strong>Submitted:</strong> {selected.submittedAt}</Typography><Typography sx={{ mt: 2 }}><strong>Application message:</strong></Typography><Typography color="text.secondary">{selected.applicationMessage}</Typography><Typography sx={{ mt: 2 }}><strong>Uploaded documents:</strong></Typography>{selected.applicationDocuments?.length ? selected.applicationDocuments.map((document) => <Box key={document.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}><Button size="small" variant="outlined" onClick={() => setPreviewDocument(document)}>Preview</Button><Button component="a" href={document.data} download={document.name} size="small" sx={{ textAlign: 'left' }}>{document.name}</Button></Box>) : <Typography variant="body2">No documents uploaded.</Typography>}{selected.reviewNotes && <Typography sx={{ mt: 2 }}><strong>Administrator notes:</strong> {selected.reviewNotes}</Typography>}</>}</DialogContent>
        <DialogActions>
          {selected && canEditApplication(selected) && <Button variant="contained" startIcon={<Edit />} onClick={() => { setSelected(null); navigate(`/candidate/positions/apply/${selected.electionId}`); }}>Edit application</Button>}
          <Button onClick={() => setSelected(null)}>Close</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(previewDocument)} onClose={() => setPreviewDocument(null)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Document preview
          <Button size="small" onClick={() => setPreviewDocument(null)}>Close</Button>
        </DialogTitle>
        <DialogContent dividers sx={{ minHeight: 420, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {previewDocument && previewIsImage && <Box component="img" src={previewDocument.data} alt={previewDocument.name} sx={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />}
          {previewDocument && previewIsPdf && <Box component="iframe" title={previewDocument.name} src={previewDocument.data} sx={{ width: '100%', height: '70vh', border: 0 }} />}
          {previewDocument && !previewIsImage && !previewIsPdf && <Box sx={{ textAlign: 'center' }}><Typography sx={{ mb: 2 }}>This file type cannot be previewed in the browser.</Typography><Button component="a" href={previewDocument.data} download={previewDocument.name} variant="contained">Download {previewDocument.name}</Button></Box>}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
