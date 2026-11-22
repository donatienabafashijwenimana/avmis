import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  IconButton,
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
import { Close, EmojiEvents, Print, Search, Visibility } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { apiRequest } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

const formatPublishedDate = (value) => {
  if (!value) return 'Publication date unavailable';
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

const formatVotes = (value) => Number(value || 0).toLocaleString();

export default function PublishedResultsBoard() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const canPrint = String(currentUser?.role || '').toLowerCase() === 'admin';
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('published-desc');
  const [selectedResult, setSelectedResult] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [detailPage, setDetailPage] = useState(0);
  const [detailRowsPerPage, setDetailRowsPerPage] = useState(5);

  const loadResults = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError('');
    try {
      const response = await apiRequest('/results.php');
      setResults(response.elections || []);
    } catch (requestError) {
      setError(requestError.message || 'Published results could not be loaded.');
      if (showSpinner) toast.error(requestError.message || 'Published results could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResults();
    const interval = window.setInterval(() => loadResults(false), 30000);
    return () => window.clearInterval(interval);
  }, []);

  const filteredResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = !query ? [...results] : results.filter((result) => (
      [result.name, result.position, ...(result.candidates || []).map((candidate) => candidate.name)]
        .some((value) => String(value || '').toLowerCase().includes(query))
    ));
    return filtered.sort((left, right) => {
      const [field, direction] = sort.split('-');
      const leftValue = field === 'votes' ? Number(left.totalVotes || 0) : field === 'published' ? new Date(left.publishedAt || 0).getTime() : left[field] || '';
      const rightValue = field === 'votes' ? Number(right.totalVotes || 0) : field === 'published' ? new Date(right.publishedAt || 0).getTime() : right[field] || '';
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number' ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue));
      return direction === 'desc' ? -comparison : comparison;
    });
  }, [results, search, sort]);

  useEffect(() => {
    setPage(0);
  }, [search, sort]);

  const totalVotes = results.reduce((total, result) => total + Number(result.totalVotes || 0), 0);
  const totalCandidates = results.reduce((total, result) => total + (result.candidates || []).length, 0);
  const declaredWinners = results.filter((result) => result.candidates?.length).length;
  const paginatedResults = filteredResults.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const winner = selectedResult?.candidates?.[0];

  const openDetails = (result) => {
    setSelectedResult(result);
    setDetailPage(0);
  };

  if (loading) {
    return <Box sx={{ minHeight: 320, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  }

  return (
    <Box className={canPrint ? 'print-table-page' : 'print-disabled-page'}>
      <Box
        className="print-hide"
        sx={{
          mb: 3,
          p: { xs: 2.5, md: 4 },
          borderRadius: 4,
          color: '#fff',
          background: 'linear-gradient(135deg, #123c2a 0%, #1b5e20 55%, #43a047 100%)',
          boxShadow: '0 14px 35px rgba(27, 94, 32, 0.22)',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="overline" sx={{ letterSpacing: 1.5, opacity: 0.8 }}>Official declaration</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.75 }}>Election Results</Typography>
            <Typography sx={{ maxWidth: 640, opacity: 0.85 }}>
              Review every published position, its winning candidate, and the complete vote breakdown.
            </Typography>
          </Box>
          {canPrint && (
            <Button
              variant="contained"
              startIcon={<Print />}
              onClick={() => window.print()}
              sx={{ bgcolor: '#fff', color: '#1b5e20', '&:hover': { bgcolor: '#e8f5e9' } }}
            >
              Print
            </Button>
          )}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box className="print-hide" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        {[
          ['Published positions', results.length],
          ['Declared winners', declaredWinners],
          ['Candidates', totalCandidates],
          ['Votes counted', formatVotes(totalVotes)],
        ].map(([label, value]) => (
          <Card key={label} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'rgba(27,94,32,0.12)' }}>
            <CardContent sx={{ p: { xs: 1.5, md: 2.5 }, '&:last-child': { pb: { xs: 1.5, md: 2.5 } } }}>
              <Typography variant="h4" sx={{ fontWeight: 800, color: '#1b5e20', fontSize: { xs: '1.6rem', md: '2.1rem' } }}>{value}</Typography>
              <Typography variant="body2" color="text.secondary">{label}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Card className="screen-results-card" sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>Results by position</Typography>
              <Typography variant="body2" color="text.secondary">Each row shows the winner; open details for every candidate’s votes.</Typography>
            </Box>
            <TextField
              size="small"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search position or candidate"
              aria-label="Search published results"
              sx={{ width: { xs: '100%', sm: 280 } }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
            />
            <TextField select size="small" label="Sort by" value={sort} onChange={(event) => { setSort(event.target.value); setPage(0); }} sx={{ minWidth: 170 }}>
              <MenuItem value="published-desc">Newest published</MenuItem>
              <MenuItem value="published-asc">Oldest published</MenuItem>
              <MenuItem value="position-asc">Position (A–Z)</MenuItem>
              <MenuItem value="votes-desc">Most votes</MenuItem>
            </TextField>
          </Box>
          <TableContainer>
            <Table sx={{ minWidth: 760 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f1f8f3' }}>
                  <TableCell sx={{ fontWeight: 800 }}>Position</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Election</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Winner</TableCell>
                  <TableCell sx={{ fontWeight: 800 }} align="right">Winner votes</TableCell>
                  <TableCell sx={{ fontWeight: 800 }} align="right">Total votes</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Published</TableCell>
                  <TableCell align="right" className="print-hide" sx={{ fontWeight: 800 }}>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody className="screen-table-body">
                {paginatedResults.map((result) => {
                  const resultWinner = result.candidates?.[0];
                  return (
                    <TableRow key={result.id} hover>
                      <TableCell><Typography fontWeight={700}>{result.position}</Typography></TableCell>
                      <TableCell>{result.name}</TableCell>
                      <TableCell>
                        {resultWinner ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar sx={{ width: 30, height: 30, bgcolor: '#e8f5e9', color: '#2e7d32', fontSize: 14 }}><EmojiEvents fontSize="small" /></Avatar>
                            <Box><Typography variant="body2" fontWeight={700}>{resultWinner.name}</Typography><Typography variant="caption" color="text.secondary">{resultWinner.party || 'Independent'}</Typography></Box>
                          </Box>
                        ) : <Typography color="text.secondary">No winner recorded</Typography>}
                      </TableCell>
                      <TableCell align="right">{resultWinner ? formatVotes(resultWinner.votes) : '—'}</TableCell>
                      <TableCell align="right">{formatVotes(result.totalVotes)}</TableCell>
                      <TableCell>{formatPublishedDate(result.publishedAt)}</TableCell>
                      <TableCell align="right" className="print-hide"><IconButton aria-label={'View ' + result.position + ' result details'} onClick={() => openDetails(result)} color="primary"><Visibility /></IconButton></TableCell>
                    </TableRow>
                  );
                })}
                {!paginatedResults.length && <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5 }}><Typography color="text.secondary">{results.length ? 'No results match your search.' : 'No election results have been published yet.'}</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={filteredResults.length}
            page={page}
            onPageChange={(_, nextPage) => setPage(nextPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(0); }}
            rowsPerPageOptions={[5, 10, 25]}
            labelRowsPerPage="Positions per page"
          />
        </CardContent>
      </Card>

      <table className="print-only-table">
        <caption>Complete published election results</caption>
        <thead>
          <tr>
            <th>Position</th>
            <th>Election</th>
            <th>Winner</th>
            <th>Candidate</th>
            <th>Candidate number</th>
            <th>Party</th>
            <th>Votes</th>
            <th>Vote share</th>
            <th>Total votes</th>
            <th>Published</th>
          </tr>
        </thead>
        <tbody>
          {filteredResults.flatMap((result) => {
            const candidates = result.candidates?.length ? result.candidates : [null];
            const totalVotesForResult = Number(result.totalVotes || 0);
            const winnerId = result.candidates?.[0]?.id;
            return candidates.map((candidate) => {
              const candidateVotes = Number(candidate?.votes || 0);
              return (
                <tr key={`${result.id}-${candidate?.id || 'none'}`}>
                  <td>{result.position}</td>
                  <td>{result.name}</td>
                  <td>{candidate?.id === winnerId ? 'Yes' : 'No'}</td>
                  <td>{candidate?.name || 'No candidate votes available'}</td>
                  <td>{candidate?.candidateNumber || '—'}</td>
                  <td>{candidate?.party || 'Independent'}</td>
                  <td>{formatVotes(candidateVotes)}</td>
                  <td>{totalVotesForResult ? `${((candidateVotes / totalVotesForResult) * 100).toFixed(1)}%` : '0.0%'}</td>
                  <td>{formatVotes(totalVotesForResult)}</td>
                  <td>{formatPublishedDate(result.publishedAt)}</td>
                </tr>
              );
            });
          })}
          {!filteredResults.length && (
            <tr><td colSpan="10">{results.length ? 'No results match your search.' : 'No election results have been published yet.'}</td></tr>
          )}
        </tbody>
      </table>

      <Dialog open={Boolean(selectedResult)} onClose={() => setSelectedResult(null)} fullWidth maxWidth="md">
        <DialogTitle sx={{ pr: 6 }}>
          <Typography variant="h6" fontWeight={800}>{selectedResult?.position}</Typography>
          <Typography variant="body2" color="text.secondary">{selectedResult?.name} · Published {formatPublishedDate(selectedResult?.publishedAt)}</Typography>
          <IconButton onClick={() => setSelectedResult(null)} size="small" sx={{ position: 'absolute', right: 12, top: 12 }}><Close /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {winner && (
            <Box sx={{ mb: 3, p: 2.5, borderRadius: 3, color: '#fff', background: 'linear-gradient(135deg, #8d6e00, #f9a825)', display: 'flex', alignItems: 'center', gap: 2 }}>
              <EmojiEvents sx={{ fontSize: 44 }} />
              <Box sx={{ flex: 1 }}><Typography variant="overline" sx={{ opacity: 0.9 }}>Winner</Typography><Typography variant="h6" fontWeight={800}>{winner.name}</Typography><Typography>{winner.party || 'Independent'} · {formatVotes(winner.votes)} votes</Typography></Box>
            </Box>
          )}
          <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>Candidate vote details</Typography>
          <Divider sx={{ mb: 1 }} />
          <TableContainer>
            <Table size="small">
              <TableHead><TableRow><TableCell sx={{ fontWeight: 800 }}>Rank</TableCell><TableCell sx={{ fontWeight: 800 }}>Candidate</TableCell><TableCell sx={{ fontWeight: 800 }}>Number</TableCell><TableCell sx={{ fontWeight: 800 }}>Party</TableCell><TableCell sx={{ fontWeight: 800 }} align="right">Votes</TableCell><TableCell sx={{ fontWeight: 800 }} align="right">Share</TableCell></TableRow></TableHead>
              <TableBody>
                {(selectedResult?.candidates || []).slice(detailPage * detailRowsPerPage, detailPage * detailRowsPerPage + detailRowsPerPage).map((candidate, index) => {
                  const rank = detailPage * detailRowsPerPage + index + 1;
                  const share = selectedResult.totalVotes ? ((candidate.votes / selectedResult.totalVotes) * 100).toFixed(1) : '0.0';
                  return <TableRow key={candidate.id} hover><TableCell>{rank}</TableCell><TableCell sx={{ fontWeight: rank === 1 ? 700 : 400 }}>{candidate.name}</TableCell><TableCell>{candidate.candidateNumber || '—'}</TableCell><TableCell>{candidate.party || 'Independent'}</TableCell><TableCell align="right">{formatVotes(candidate.votes)}</TableCell><TableCell align="right">{share}%</TableCell></TableRow>;
                })}
                {!selectedResult?.candidates?.length && <TableRow><TableCell colSpan={6} align="center">No candidate votes are available.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={selectedResult?.candidates?.length || 0}
            page={detailPage}
            onPageChange={(_, nextPage) => setDetailPage(nextPage)}
            rowsPerPage={detailRowsPerPage}
            onRowsPerPageChange={(event) => { setDetailRowsPerPage(Number(event.target.value)); setDetailPage(0); }}
            rowsPerPageOptions={[5, 10, 25]}
            labelRowsPerPage="Candidates per page"
          />
        </DialogContent>
        <DialogActions><Button onClick={() => setSelectedResult(null)}>Close</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
