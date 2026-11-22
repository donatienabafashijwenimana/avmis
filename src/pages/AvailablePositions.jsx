import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, IconButton, TextField, Typography,
} from '@mui/material';
import { Close, Delete, Send } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useDataStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { apiRequest } from '../lib/api';
import ListToolbar from '../components/ListToolbar';

const dateValue = (value) => (value ? new Date(value.replace(' ', 'T')).getTime() : null);
const MAX_DOCUMENTS = 5;
const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024;
const MAX_DOCUMENT_TOTAL_SIZE = 10 * 1024 * 1024;
const DOCUMENT_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const fileExtension = (name) => name.toLowerCase().split('.').pop() || '';
const formatFileSize = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
const readDocument = (file) => new Promise((resolve, reject) => {
  const type = DOCUMENT_TYPES[fileExtension(file.name)];
  const reader = new FileReader();
  reader.onerror = () => reject(new Error(`Could not read ${file.name}. Please choose the file again.`));
  reader.onload = () => {
    const data = String(reader.result || '').replace(/^data:[^;]+;/, `data:${type};`);
    resolve({ name: file.name, type, data, size: file.size });
  };
  reader.readAsDataURL(file);
});

const applicationWindowOpen = (election, now = Date.now()) => {
  if (!['Draft', 'Open'].includes(election.status)) return false;
  if (election.applicationStatus === 'Closed') return false;
  if (election.applicationStatus === 'Open') return true;
  const starts = dateValue(election.applicationStartsAt);
  const ends = dateValue(election.applicationEndsAt);
  return (!starts || starts <= now) && (!ends || ends > now);
};

const votingWindowOpen = (election, now = Date.now()) => {
  if (election.status !== 'Open') return false;
  if (Number(election.candidateCount) < 1) return false;
  if (election.votingAccess === 'Closed') return false;
  if (election.votingAccess === 'Open') return true;
  const starts = dateValue(election.votingStartsAt);
  const ends = dateValue(election.votingEndsAt);
  return (!starts || starts <= now) && (!ends || ends > now);
};

export default function AvailablePositionsPage() {
  const navigate = useNavigate();
  const { electionId } = useParams();
  const elections = useDataStore((state) => state.elections);
  const positions = useDataStore((state) => state.positions);
  const candidates = useDataStore((state) => state.candidates);
  const dataLoading = useDataStore((state) => state.loading);
  const currentUser = useAuthStore((state) => state.currentUser);
  const [candidateProfile, setCandidateProfile] = useState(null);
  const [availableElections, setAvailableElections] = useState([]);
  const [applications, setApplications] = useState([]);
  const [selectedElection, setSelectedElection] = useState(null);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [criteriaConfirmed, setCriteriaConfirmed] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [documentError, setDocumentError] = useState('');
  const [previewDocument, setPreviewDocument] = useState(null);
  const [search, setSearch] = useState('');
  const [applicationFilter, setApplicationFilter] = useState('');
  const [sort, setSort] = useState('position-asc');
  const documentInputRef = useRef(null);

  const candidate = candidates.find((item) => item.id === currentUser?.candidateId) || candidateProfile;
  const previewType = previewDocument?.type || previewDocument?.data?.match(/^data:([^;,]+)/)?.[1] || '';
  const previewIsImage = previewType.startsWith('image/');
  const previewIsPdf = previewType === 'application/pdf';

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadCandidateData = () => {
      setLoadError('');
      return Promise.allSettled([apiRequest('/applications.php'), apiRequest('/candidates.php'), apiRequest('/elections.php')])
      .then(([applicationResult, candidateResult, electionResult]) => {
        const failed = [];
        if (applicationResult.status === 'fulfilled') {
          setApplications(applicationResult.value.applications || []);
        } else {
          failed.push('applications');
        }
        if (candidateResult.status === 'fulfilled') {
          setCandidateProfile((candidateResult.value.candidates || []).find((item) => item.id === currentUser?.candidateId) || null);
        } else {
          failed.push('candidate profile');
        }
        if (electionResult.status === 'fulfilled') {
          setAvailableElections(electionResult.value.elections || []);
        } else {
          failed.push('available positions');
        }
        if (failed.length) {
          const message = `Could not load ${failed.join(', ')}. The system will try again automatically.`;
          setLoadError(message);
          toast.error(message);
        }
      })
      .finally(() => setLoading(false));
    };
    loadCandidateData();
    const interval = window.setInterval(loadCandidateData, 30000);
    return () => window.clearInterval(interval);
  }, [currentUser?.candidateId]);

  const available = useMemo(
    () => (elections.length ? elections : availableElections).filter((election) => (
      applicationWindowOpen(election, currentTime) && !votingWindowOpen(election, currentTime)
    )),
    [currentTime, elections, availableElections],
  );

  const visibleAvailable = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = available.filter((election) => {
      const existing = applications.find((application) => application.positionId === election.positionId);
      const applicationState = existing?.status === 'Approved' ? 'approved' : existing ? 'in-progress' : 'new';
      return (!query || [election.position, election.name].some((value) => String(value || '').toLowerCase().includes(query)))
        && (!applicationFilter || applicationState === applicationFilter);
    });
    return rows.sort((left, right) => {
      const [field, direction] = sort.split('-');
      const comparison = String(left[field] || '').localeCompare(String(right[field] || ''));
      return direction === 'desc' ? -comparison : comparison;
    });
  }, [applicationFilter, applications, available, search, sort]);

  const getElectionDetails = useCallback((election) => {
    const position = positions.find((item) => item.id === election.positionId);
    return {
      ...election,
      criteria: election.criteria || position?.criteria || '',
      requiredDocuments: election.requiredDocuments || position?.requiredDocuments || '',
    };
  }, [positions]);

  const beginApplication = useCallback((election) => {
    const existing = applications.find((application) => application.positionId === election.positionId);
    if (existing?.status === 'Approved') {
      toast.info('This application has already been approved and cannot be edited.');
      return;
    }
    setSelectedElection(getElectionDetails(election));
    setApplicationMessage(existing?.applicationMessage || candidate?.applicationMessage || '');
    setCriteriaConfirmed(Boolean(existing?.criteriaConfirmed));
    setDocuments(existing?.applicationDocuments || []);
    setDocumentError('');
    setOpen(true);
    if (String(election.id) !== String(electionId)) {
      navigate(`/candidate/positions/apply/${election.id}`);
    }
  }, [applications, candidate, electionId, getElectionDetails, navigate]);

  const showMore = useCallback((election) => {
    setSelectedElection(getElectionDetails(election));
    setDetailsOpen(true);
  }, [getElectionDetails]);

  useEffect(() => {
    if (!electionId || !available.length) return;
    const election = available.find((item) => String(item.id) === String(electionId));
    if (election && (!open || String(selectedElection?.id) !== String(election.id))) {
      beginApplication(election);
    } else {
      if (!election) navigate('/candidate/positions', { replace: true });
    }
  }, [available, beginApplication, electionId, navigate, open, selectedElection]);

  useEffect(() => {
    if (!open || !selectedElection || applicationWindowOpen(selectedElection, currentTime)) return;
    setOpen(false);
    setSelectedElection(null);
    toast.info('The application period for this position has ended.');
    if (electionId) navigate('/candidate/positions', { replace: true });
  }, [currentTime, electionId, navigate, open, selectedElection]);

  const closeApplication = () => {
    if (saving) return;
    setOpen(false);
    navigate('/candidate/positions');
  };

  const handleDocumentChange = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    setDocumentError('');
    const existingNames = new Set(documents.map((document) => document.name.toLowerCase()));
    const newFiles = files.filter((file) => !existingNames.has(file.name.toLowerCase()));
    const unsupported = newFiles.find((file) => !DOCUMENT_TYPES[fileExtension(file.name)]);
    const tooLarge = newFiles.find((file) => file.size > MAX_DOCUMENT_SIZE);
    const empty = newFiles.find((file) => file.size === 0);

    if (unsupported) {
      setDocumentError(`${unsupported.name} is not supported. Choose PDF, JPG, PNG, DOC, or DOCX files.`);
      return;
    }
    if (empty) {
      setDocumentError(`${empty.name} is empty. Choose a file with content.`);
      return;
    }
    if (tooLarge) {
      setDocumentError(`${tooLarge.name} is too large. Each document must be under 5MB.`);
      return;
    }
    if (documents.length + newFiles.length > MAX_DOCUMENTS) {
      setDocumentError(`You can upload up to ${MAX_DOCUMENTS} documents.`);
      return;
    }
    if (documents.reduce((total, document) => total + document.size, 0) + newFiles.reduce((total, file) => total + file.size, 0) > MAX_DOCUMENT_TOTAL_SIZE) {
      setDocumentError('The combined document size must be under 10MB.');
      return;
    }

    try {
      const nextDocuments = await Promise.all(newFiles.map(readDocument));
      setDocuments((current) => [...current, ...nextDocuments]);
    } catch (error) {
      setDocumentError(error.message || 'A document could not be read. Please try again.');
    }
  };

  const removeDocument = (name) => {
    setDocuments((current) => current.filter((document) => document.name !== name));
    setDocumentError('');
  };

  const submit = async () => {
    if (!selectedElection || !applicationMessage.trim() || !documents.length || !criteriaConfirmed) {
      toast.error('Complete the application message, upload a supporting document, and confirm the criteria.');
      return;
    }
    setSaving(true);
    try {
      const existing = applications.find((application) => application.positionId === selectedElection.positionId);
      const response = await apiRequest(existing ? `/applications.php?id=${existing.id}` : '/applications.php', {
        method: existing ? 'PUT' : 'POST',
        body: JSON.stringify({ electionId: selectedElection.id, applicationMessage: applicationMessage.trim(), criteriaConfirmed, documents }),
      });
      setApplications((current) => [response.application, ...current.filter((item) => item.id !== response.application.id)]);
      setOpen(false);
      toast.success(existing ? 'Application updated for administrator review.' : 'Application submitted for administrator approval.');
      navigate('/candidate/applications');
    } catch (error) {
      toast.error(error.message || 'Application could not be submitted.');
    } finally {
      setSaving(false);
    }
  };

  if (!candidate && (loading || dataLoading)) {
    return dataLoading
      ? <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 240 }}><CircularProgress /></Box>
      : <CircularProgress />;
  }
  if (!candidate) return <Alert severity="error">Your candidate profile could not be found. Please contact the administrator.</Alert>;

  return (
    <Box className="print-table-page">
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Available Position</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>Apply during the application period set by the administrator.</Typography>
      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Applications currently open</Typography>
      {loading ? <CircularProgress /> : <>
        <ListToolbar
          search={search}
          onSearch={setSearch}
          searchLabel="Search positions"
          filter={applicationFilter}
          onFilter={setApplicationFilter}
          filterLabel="Application"
          filterOptions={[{ value: '', label: 'All applications' }, { value: 'new', label: 'Not started' }, { value: 'in-progress', label: 'In progress' }, { value: 'approved', label: 'Approved' }]}
          sort={sort}
          onSort={setSort}
          sortOptions={[{ value: 'position-asc', label: 'Position (A–Z)' }, { value: 'position-desc', label: 'Position (Z–A)' }, { value: 'name-asc', label: 'Election (A–Z)' }]}
          onPrint={() => window.print()}
        />
        {visibleAvailable.length ? visibleAvailable.map((election) => (
        <Card key={election.id} sx={{ mb: 2, borderRadius: 3 }}><CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ flex: 1, minWidth: 260 }}>
            <Typography variant="h6" fontWeight={700}>{election.position}</Typography>
            <Typography color="text.secondary">{election.name}</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" onClick={() => showMore(election)}>Show more</Button>
            <Button variant="contained" startIcon={<Send />} disabled={applications.some((application) => application.positionId === election.positionId && application.status === 'Approved')} onClick={() => beginApplication(election)}>
              {applications.some((application) => application.positionId === election.positionId && application.status !== 'Approved') ? 'Edit application' : applications.some((application) => application.positionId === election.positionId && application.status === 'Approved') ? 'Approved' : 'Apply'}
            </Button>
          </Box>
        </CardContent></Card>
        )) : <Alert severity="info">{available.length ? 'No positions match the current filters.' : 'No positions are currently available for application.'}</Alert>}
      </>}

      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          {selectedElection?.position}
          <IconButton onClick={() => setDetailsOpen(false)} sx={{ float: 'right' }}><Close /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography color="text.secondary" sx={{ mb: 2 }}>{selectedElection?.name}</Typography>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Application period</Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {selectedElection?.applicationStartsAt || 'Immediately'} – {selectedElection?.applicationEndsAt || 'Until closed'}
          </Typography>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Eligibility criteria</Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>
            {selectedElection?.criteria || 'No eligibility criteria provided.'}
          </Typography>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Required documents</Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {selectedElection?.requiredDocuments || 'No required documents listed.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)}>Close</Button>
          <Button variant="contained" startIcon={<Send />} disabled={!selectedElection || !applicationWindowOpen(selectedElection, currentTime) || applications.some((application) => application.positionId === selectedElection.positionId && application.status === 'Approved')} onClick={() => { setDetailsOpen(false); beginApplication(selectedElection); }}>
            {selectedElection && applicationWindowOpen(selectedElection, currentTime) ? (applications.some((application) => application.positionId === selectedElection.positionId && application.status === 'Approved') ? 'Approved' : applications.some((application) => application.positionId === selectedElection.positionId) ? 'Edit application' : 'Apply') : 'Applications closed'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={open} onClose={closeApplication} fullWidth maxWidth="sm">
        <DialogTitle>{applications.some((application) => application.positionId === selectedElection?.positionId) ? 'Edit application for' : 'Apply for'} {selectedElection?.name}<IconButton onClick={closeApplication} sx={{ float: 'right' }}><Close /></IconButton></DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>Position: {selectedElection?.position}</Typography>
          <Box sx={{ mb: 2, p: 2, borderRadius: 2, bgcolor: '#f1f8e9', border: '1px solid #c5e1a5' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#33691e' }}>Eligibility criteria</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{selectedElection?.criteria || 'No eligibility criteria provided.'}</Typography>
            {selectedElection?.requiredDocuments && <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}><strong>Required documents:</strong> {selectedElection.requiredDocuments}</Typography>}
          </Box>
          <TextField
            required
            fullWidth
            multiline
            minRows={4}
            label="Application message"
            inputProps={{ maxLength: 5000 }}
            value={applicationMessage}
            onChange={(event) => setApplicationMessage(event.target.value)}
            sx={{ mb: 2 }}
          />
          <Button component="label" variant="outlined" fullWidth sx={{ justifyContent: 'flex-start', mb: 1 }}>
            {documents.length ? 'Add another document' : 'Upload supporting documents'}
            <input
              hidden
              ref={documentInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={handleDocumentChange}
            />
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            PDF, JPG, PNG, DOC, or DOCX · up to 5 files · 5MB each · 10MB total
          </Typography>
          {documentError && <Alert severity="error" sx={{ mb: 1 }}>{documentError}</Alert>}
          {documents.length > 0 && documents.map((document) => (
            <Box key={document.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, px: 1, py: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{document.name}</Typography>
              <Typography variant="caption" color="text.secondary">{formatFileSize(document.size)}</Typography>
              <Button size="small" onClick={() => setPreviewDocument(document)}>Preview</Button>
              <IconButton size="small" aria-label={`Remove ${document.name}`} onClick={() => removeDocument(document.name)} disabled={saving}>
                <Delete fontSize="small" />
              </IconButton>
            </Box>
          ))}
          {!documents.length && <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>At least one supporting document is required.</Typography>}
          <FormControlLabel control={<Checkbox required checked={criteriaConfirmed} onChange={(event) => setCriteriaConfirmed(event.target.checked)} />} label="I confirm that I meet the requirements for this position." />
        </DialogContent>
        <DialogActions><Button onClick={closeApplication}>Cancel</Button><Button variant="contained" startIcon={<Send />} onClick={submit} disabled={saving || !applicationMessage.trim() || !documents.length || !criteriaConfirmed}>{saving ? 'Saving…' : applications.some((application) => application.positionId === selectedElection?.positionId) ? 'Save application' : 'Submit application'}</Button></DialogActions>
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
