import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, TextField, Typography } from '@mui/material';
import { HowToVote } from '@mui/icons-material';
import { apiRequest } from '../lib/api';
import { toast } from 'react-toastify';
import ValidatedTextField from '../components/ValidatedTextField';
import { emailError, partyFieldErrors, requiredText, validCode } from '../lib/validation';

const blankParty = { name: '', email: '', abbreviation: '', slogan: '', logo: '' };

const readLogo = (event, setForm, form, setFieldErrors) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    toast.error('Party logo must be a JPEG or PNG image under 2MB.');
    setFieldErrors((current) => ({ ...current, logo: 'Party logo must be a JPEG or PNG image under 2MB.' }));
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    setForm({ ...form, logo: reader.result });
    setFieldErrors((current) => ({ ...current, logo: '' }));
  };
  reader.readAsDataURL(file);
};

export default function PartyRegistrationPage() {
  const [form, setForm] = useState(blankParty);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: '' }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    const nextFieldErrors = partyFieldErrors(form);
    setFieldErrors(nextFieldErrors);
    if (Object.values(nextFieldErrors).some(Boolean)) {
      setError('Please correct the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/political_parties.php', { method: 'POST', body: JSON.stringify(form) });
      setForm(blankParty);
      setFieldErrors({});
      setSuccess('Registration submitted. An administrator will review the party and email the decision.');
      toast.success('Political party registration submitted for approval.');
    } catch (requestError) {
      setError(requestError.message || 'Political party registration could not be submitted.');
      toast.error(requestError.message || 'Political party registration could not be submitted.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, background: '#fff' }}>
      <Card sx={{ width: '100%', maxWidth: 560, p: { xs: 2, sm: 5 }, borderRadius: 4, border: '1px solid', boxShadow: '0 20px 60px rgba(27, 94, 32, 0.2)' }} elevation={0}>
        <CardContent>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <HowToVote sx={{ fontSize: 42, color: 'success.main' }} />
            <Typography variant="h5" sx={{ fontWeight: 800 }}>Register a political party</Typography>
            <Typography color="text.secondary">Submit your party for administrator approval.</Typography>
          </Box>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
          <Box component="form" onSubmit={submit}>
            <ValidatedTextField required fullWidth label="Party name" value={form.name} validate={requiredText('Party name', 120)} error={fieldErrors.name} helperText={fieldErrors.name} inputProps={{ maxLength: 120 }} onChange={(e) => updateField('name', e.target.value)} sx={{ mb: 2 }} />
            <ValidatedTextField required fullWidth type="email" label="Email for decision notification" value={form.email} validate={emailError} error={fieldErrors.email} helperText={fieldErrors.email} inputProps={{ maxLength: 255 }} onChange={(e) => updateField('email', e.target.value)} sx={{ mb: 2 }} />
            <ValidatedTextField required fullWidth label="Abbreviation" value={form.abbreviation} validate={(value) => validCode(value) ? '' : 'Use 2–32 letters, numbers, hyphens, or underscores.'} error={fieldErrors.abbreviation} helperText={fieldErrors.abbreviation} inputProps={{ maxLength: 32 }} onChange={(e) => updateField('abbreviation', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} sx={{ mb: 2 }} />
            <ValidatedTextField required fullWidth label="Slogan" value={form.slogan} validate={requiredText('Slogan', 500)} error={fieldErrors.slogan} helperText={fieldErrors.slogan} inputProps={{ maxLength: 500 }} onChange={(e) => updateField('slogan', e.target.value)} sx={{ mb: 2 }} />
            <Button component="label" variant="outlined" fullWidth sx={{ justifyContent: 'flex-start', mb: form.logo ? 1 : 3 }}>
              {form.logo ? 'Change party logo' : 'Upload party logo (optional)'}
              <input hidden required type="file" accept="image/jpeg,image/png" onChange={(event) => readLogo(event, setForm, form, setFieldErrors)} />
            </Button>
            {fieldErrors.logo && <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5, mb: 2 }}>{fieldErrors.logo}</Typography>}
            {form.logo && <Box component="img" src={form.logo} alt="Party logo preview" sx={{ display: 'block', maxWidth: 100, maxHeight: 70, objectFit: 'contain', borderRadius: 1, mb: 3 }} />}
            <Button type="submit" fullWidth variant="contained" disabled={saving}>{saving ? 'Submitting…' : 'Submit for approval'}</Button>
            <Button component={RouterLink} to="/" fullWidth sx={{ mt: 1 }}>Back to login</Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
