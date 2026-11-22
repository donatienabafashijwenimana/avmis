import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import { CheckCircle, Visibility } from '@mui/icons-material';
import { apiRequest } from '../lib/api';
import { toast } from 'react-toastify';
import TableActions from '../components/TableActions';
import ListToolbar from '../components/ListToolbar';

const statusColor = {
  Pending: 'warning',
  Approved: 'success',
  Rejected: 'error',
};

export default function ApplicationsPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('submitted-desc');

  useEffect(() => {
    const loadApplications = () => apiRequest('/applications.php')
      .then((response) => setApplications(response.applications || []))
      .catch((requestError) => setError(requestError.message || 'Applications could not be loaded.'))
      .finally(() => setLoading(false));
    loadApplications();
    const interval = window.setInterval(loadApplications, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const visibleApplications = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = applications.filter((application) => {
      const matchesSearch = !query || [application.candidateName, application.position, application.party]
        .some((value) => String(value || '').toLowerCase().includes(query));
      return matchesSearch && (!statusFilter || application.status === statusFilter);
    });
    return rows.sort((left, right) => {
      const [field, direction] = sort.split('-');
      const leftValue = field === 'submitted' ? new Date(left.submittedAt || 0).getTime() : field === 'candidate' ? left.candidateName || '' : left[field] || '';
      const rightValue = field === 'submitted' ? new Date(right.submittedAt || 0).getTime() : field === 'candidate' ? right.candidateName || '' : right[field] || '';
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue));
      return direction === 'desc' ? -comparison : comparison;
    });
  }, [applications, search, sort, statusFilter]);
  const safePage = Math.min(page, Math.max(0, Math.ceil(visibleApplications.length / rowsPerPage) - 1));
  const paginatedApplications = visibleApplications.slice(
    safePage * rowsPerPage,
    safePage * rowsPerPage + rowsPerPage,
  );

  const reviewApplication = async (application, status) => {
    if (status === 'Rejected' && !window.confirm(`Reject ${application.candidateName}'s application?`)) return;
    setUpdatingId(application.id);
    try {
      const response = await apiRequest(`/applications.php?id=${application.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      setApplications((current) => current.map((item) => (
        item.id === application.id ? response.application : item
      )));
      setSelectedApplication(response.application);
      toast.success(`${application.candidateName}'s application is ${status.toLowerCase()}.`);
    } catch (requestError) {
      toast.error(requestError.message || 'Application status could not be updated.');
    } finally {
      setUpdatingId(null);
    }
  };

  const previewType = (document) => document?.type || document?.data?.match(/^data:([^;,]+)/)?.[1] || '';
  const previewIsImage = previewType(previewDocument).startsWith('image/');
  const previewIsPdf = previewType(previewDocument) === 'application/pdf';

  return (
    <Box className="print-table-page">
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Applications</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Review candidate applications and the requirements recorded at submission.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? <CircularProgress /> : (
        <Card sx={{ borderRadius: 3 }}>
          <CardContent>
            <ListToolbar
              search={search}
              onSearch={(value) => { setSearch(value); setPage(0); }}
              searchLabel="Search applications"
              filter={statusFilter}
              onFilter={(value) => { setStatusFilter(value); setPage(0); }}
              filterLabel="Status"
              filterOptions={[{ value: '', label: 'All statuses' }, ...Object.keys(statusColor).map((value) => ({ value, label: value }))]}
              sort={sort}
              onSort={(value) => { setSort(value); setPage(0); }}
              sortOptions={[
                { value: 'submitted-desc', label: 'Newest submitted' },
                { value: 'submitted-asc', label: 'Oldest submitted' },
                { value: 'candidate-asc', label: 'Candidate (A–Z)' },
                { value: 'position-asc', label: 'Position (A–Z)' },
              ]}
              onPrint={() => window.print()}
            />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Candidate</TableCell>
                    <TableCell>Position</TableCell>
                    <TableCell>Party</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Criteria confirmed</TableCell>
                    <TableCell>Submitted</TableCell>
                    <TableCell align="right" className="print-hide">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody className="screen-table-body">
                  {paginatedApplications.map((application) => (
                    <TableRow key={application.id} hover>
                      <TableCell>{application.candidateName}</TableCell>
                      <TableCell>{application.position}</TableCell>
                      <TableCell>{application.party}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={application.status}
                          color={statusColor[application.status] || 'default'}
                        />
                      </TableCell>
                    <TableCell>{application.criteriaConfirmed ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{new Date(application.submittedAt).toLocaleString()}</TableCell>
                    <TableCell align="right" className="print-hide">
                      <TableActions actions={[{ key: 'review', label: 'Review application', icon: <Visibility fontSize="small" />, onClick: () => setSelectedApplication(application) }]} />
                    </TableCell>
                  </TableRow>
                ))}
                {!visibleApplications.length && (
                    <TableRow><TableCell colSpan={7}>No applications recorded yet.</TableCell></TableRow>
                )}
                </TableBody>
                <TableBody className="print-table-body">
                  {visibleApplications.map((application) => (
                    <TableRow key={application.id} hover>
                      <TableCell>{application.candidateName}</TableCell>
                      <TableCell>{application.position}</TableCell>
                      <TableCell>{application.party}</TableCell>
                      <TableCell>{application.status}</TableCell>
                      <TableCell>{application.criteriaConfirmed ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{new Date(application.submittedAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {!visibleApplications.length && (
                    <TableRow><TableCell colSpan={6}>No applications recorded yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            {visibleApplications.length > 0 && (
              <TablePagination
                component="div"
                count={visibleApplications.length}
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

      <Dialog
        open={Boolean(selectedApplication)}
        onClose={() => updatingId === null && setSelectedApplication(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Review candidate application
          <Button size="small" onClick={() => setSelectedApplication(null)} disabled={updatingId !== null}>
            Close
          </Button>
        </DialogTitle>
        <DialogContent dividers>
          {selectedApplication && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{selectedApplication.candidateName}</Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                {selectedApplication.position} · {selectedApplication.party || 'Independent'}
              </Typography>

              <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f1f8e9', mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Criteria confirmation</Typography>
                <Typography variant="body2">
                  {selectedApplication.criteriaConfirmed
                    ? 'The candidate confirmed that they meet the position criteria.'
                    : 'The candidate has not confirmed the position criteria.'}
                </Typography>
              </Box>

              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Eligibility criteria</Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {selectedApplication.criteriaSnapshot || 'Not recorded'}
              </Typography>

              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Required documents</Typography>
              <Box component="ul" sx={{ mt: 0, mb: 2, pl: 2.5 }}>
                {(selectedApplication.requiredDocumentsSnapshot || '').split(/\r?\n/).filter(Boolean).map((document) => (
                  <Typography component="li" variant="body2" key={document}>{document}</Typography>
                ))}
                {!selectedApplication.requiredDocumentsSnapshot && (
                  <Typography component="li" variant="body2">Not recorded</Typography>
                )}
              </Box>

              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Application message</Typography>
              <Typography variant="body2">{selectedApplication.applicationMessage || 'Not recorded'}</Typography>

              <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 2 }}>Uploaded documents</Typography>
              {selectedApplication.applicationDocuments?.length ? selectedApplication.applicationDocuments.map((document) => (
                <Box key={document.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Button size="small" variant="outlined" onClick={() => setPreviewDocument(document)}>
                    Preview
                  </Button>
                  <Button component="a" href={document.data} download={document.name} size="small" sx={{ textAlign: 'left' }}>
                    {document.name}
                  </Button>
                </Box>
              )) : <Typography variant="body2">No documents uploaded.</Typography>}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {selectedApplication && selectedApplication.status !== 'Rejected' && (
            <Button
              color="error"
              variant="outlined"
              onClick={() => reviewApplication(selectedApplication, 'Rejected')}
              disabled={updatingId === selectedApplication.id}
            >
              Reject
            </Button>
          )}
          {selectedApplication && selectedApplication.status !== 'Approved' && (
            <Button
              color="success"
              variant="contained"
              startIcon={<CheckCircle />}
              onClick={() => reviewApplication(selectedApplication, 'Approved')}
              disabled={updatingId === selectedApplication.id || !selectedApplication.criteriaConfirmed}
            >
              Approve
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(previewDocument)} onClose={() => setPreviewDocument(null)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Document preview
          <Button size="small" onClick={() => setPreviewDocument(null)}>Close</Button>
        </DialogTitle>
        <DialogContent dividers sx={{ minHeight: 420, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {previewDocument && previewIsImage && (
            <Box component="img" src={previewDocument.data} alt={previewDocument.name} sx={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
          )}
          {previewDocument && previewIsPdf && (
            <Box component="iframe" title={previewDocument.name} src={previewDocument.data} sx={{ width: '100%', height: '70vh', border: 0 }} />
          )}
          {previewDocument && !previewIsImage && !previewIsPdf && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ mb: 2 }}>This file type cannot be previewed in the browser.</Typography>
              <Button component="a" href={previewDocument.data} download={previewDocument.name} variant="contained">
                Download {previewDocument.name}
              </Button>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
