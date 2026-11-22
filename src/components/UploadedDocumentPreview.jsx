import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { Close, Visibility } from '@mui/icons-material';

export default function UploadedDocumentPreview({ label, src, alt = label }) {
  const [open, setOpen] = useState(false);

  if (!src) {
    return (
      <Typography variant="body2" color="text.secondary">
        {label}: Not uploaded
      </Typography>
    );
  }

  return (
    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>{label}</Typography>
      <Box
        component="img"
        src={src}
        alt={alt}
        onClick={() => setOpen(true)}
        sx={{ width: '100%', height: 130, objectFit: 'contain', borderRadius: 1, cursor: 'pointer', bgcolor: 'background.paper' }}
      />
      <Button size="small" startIcon={<Visibility />} onClick={() => setOpen(true)} sx={{ mt: 1 }}>
        Preview document
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>{label}</DialogTitle>
        <DialogContent dividers sx={{ textAlign: 'center' }}>
          <Box component="img" src={src} alt={alt} sx={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
        </DialogContent>
        <DialogActions>
          <Button startIcon={<Close />} onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
