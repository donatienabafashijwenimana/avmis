import { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  Button,
  Chip,
  Avatar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Alert,
  Divider,
  Grid,
} from '@mui/material';
import {
  Edit,
  Close,
  PhotoCamera,
  Badge,
  HowToVote,
  CheckCircle,
  Lock,
  Schedule,
} from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { validPassword } from '../lib/validation';

const districts = [
  'District A - Kigali',
  'District B - Huye',
  'District C - Musanze',
  'District D - Rubavu',
  'District E - Muhanga',
  'District F - Nyagatare',
  'District G - Rusizi',
];

const emptyForm = {
  name: '',
  email: '',
  pollingDistrict: '',
  status: 'Active',
};

export default function ProfilePage() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const votedPositions = useAuthStore((s) => s.votedPositions);
  const updateProfile = useDataStore((s) => s.updateProfile);
  const changePassword = useDataStore((s) => s.changePassword);
  const isVoter = currentUser?.role === 'voter';

  const [formOpen, setFormOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [formErrors, setFormErrors] = useState({});
  const [passwordFormErrors, setPasswordFormErrors] = useState({});
  const [photoPreview, setPhotoPreview] = useState('');
  const [nationalIdPreview, setNationalIdPreview] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const profileRecord = currentUser;

  const handleOpenEdit = () => {
    if (!profileRecord) return;
    setForm({
      name: profileRecord.name || '',
      email: profileRecord.email || '',
      pollingDistrict: profileRecord.pollingDistrict || '',
      status: profileRecord.status || 'Active',
    });
    setPhotoPreview(profileRecord.idPhoto || '');
    setNationalIdPreview(profileRecord.nationalIdDocument || '');
    setFormErrors({});
    setErrorMessage('');
    setFormOpen(true);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setFormErrors((prev) => ({ ...prev, idPhoto: 'Only JPEG/PNG files allowed' }));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFormErrors((prev) => ({ ...prev, idPhoto: 'File must be under 2MB' }));
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result);
      setFormErrors((prev) => ({ ...prev, idPhoto: '' }));
    };
    reader.readAsDataURL(file);
  };

  const handleNationalIdChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setFormErrors((prev) => ({ ...prev, nationalIdDocument: 'Only JPEG/PNG files allowed' }));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFormErrors((prev) => ({ ...prev, nationalIdDocument: 'File must be under 2MB' }));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setNationalIdPreview(reader.result);
      setFormErrors((prev) => ({ ...prev, nationalIdDocument: '' }));
    };
    reader.readAsDataURL(file);
  };

  const validateForm = () => {
    const errors = {};

    if (!form.name.trim()) errors.name = 'Name is required';

    if (!form.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = 'Invalid email format';
    }

    if (currentUser.role !== 'admin' && !nationalIdPreview) {
      errors.nationalIdDocument = 'National ID document is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm() || !profileRecord) return;

    const updateData = {
      name: form.name,
      email: form.email,
      idPhoto: photoPreview || profileRecord.idPhoto || '',
      nationalIdDocument: nationalIdPreview || profileRecord.nationalIdDocument || '',
    };

    setSaving(true);
    setErrorMessage('');
    try {
      await updateProfile(updateData);
      setSuccessMessage('Profile updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
      setFormOpen(false);
      setFormErrors({});
    } catch (error) {
      setErrorMessage(error.message || 'Profile could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenPassword = () => {
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordFormErrors({});
    setErrorMessage('');
    setPasswordOpen(true);
  };

  const validatePasswordForm = () => {
    const errors = {};
    if (!passwordForm.currentPassword) errors.currentPassword = 'Current password is required.';
    if (!passwordForm.newPassword) {
      errors.newPassword = 'New password is required.';
    } else if (!validPassword(passwordForm.newPassword)) {
      errors.newPassword = 'Use 8+ characters with an uppercase letter, number, and special character.';
    }
    if (!passwordForm.confirmPassword) {
      errors.confirmPassword = 'Please confirm the new password.';
    } else if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    setPasswordFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePasswordSubmit = async () => {
    if (!validatePasswordForm()) return;

    setPasswordSaving(true);
    setErrorMessage('');
    try {
      await changePassword(passwordForm);
      setSuccessMessage('Password changed successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
      setPasswordOpen(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordFormErrors({});
    } catch (error) {
      setErrorMessage(error.message || 'Password could not be changed.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const userVotedPositions = votedPositions[currentUser?.voterId] || {};
  const voteCount = Object.keys(userVotedPositions).length;

  if (!currentUser) {
    return null;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          {successMessage && (
            <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
              {successMessage}
            </Alert>
          )}
          {errorMessage && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{errorMessage}</Alert>}
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
            My Profile
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your personal information and voting status
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" startIcon={<Lock />} onClick={handleOpenPassword} sx={{ borderRadius: 2 }}>
            Change password
          </Button>
          <Button variant="contained" startIcon={<Edit />} onClick={handleOpenEdit} sx={{ borderRadius: 2 }}>
            Edit Profile
          </Button>
        </Box>
      </Box>

      <Card elevation={4} sx={{ borderRadius: 4, overflow: 'hidden', mb: 4, border: '1px solid', borderColor: '#c8e6c9' }}>
        <Box sx={{ p: 4, textAlign: 'center', bgcolor: 'primary.50' }}>
          <Avatar
            src={photoPreview || currentUser.idPhoto}
            sx={{
              width: 120,
              height: 120,
              mx: 'auto',
              mb: 2,
              fontSize: '2.5rem',
              fontWeight: 700,
              bgcolor: 'primary.main',
            }}
          >
            {currentUser.name?.charAt(0)?.toUpperCase() || 'U'}
          </Avatar>
          <Typography variant="h3" sx={{ fontWeight: 800, mb: 1 }}>
            {currentUser.name}
          </Typography>
          <Chip
            label={currentUser.role === 'admin' ? 'Administrator' : currentUser.role === 'candidate' ? 'Candidate' : 'Voter'}
            size="large"
            sx={{
              fontSize: '0.9rem',
              fontWeight: 700,
              height: 32,
              bgcolor: currentUser.role === 'admin' ? '#2e7d32' : currentUser.role === 'candidate' ? '#7c3aed' : '#43a047',
              color: 'white',
            }}
          />
        </Box>
      </Card>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card elevation={2} sx={{ borderRadius: 3, height: '100%', border: '1px solid', borderColor: '#e8f5e9' }}>
            <Box sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Badge fontSize="small" color="primary" />
                Profile Information
              </Typography>
              <Divider sx={{ mb: 3 }} />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>{isVoter ? 'National ID' : currentUser.role === 'candidate' ? 'Candidate National ID' : 'Username'}</Typography>
                  <Typography variant="body1" fontFamily="monospace" fontWeight={600} sx={{ color: 'primary.main' }}>
                    {isVoter ? currentUser.voterId || 'Not set' : currentUser.role === 'candidate' ? currentUser.candidateNationalId || 'Not set' : currentUser.username || 'Not set'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>Email</Typography>
                  <Typography>{currentUser.email || 'Not set'}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>Polling District</Typography>
                  <Typography>{currentUser.pollingDistrict || 'Not set'}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>Status</Typography>
                  <Chip
                    label={currentUser.status || 'Active'}
                    color={currentUser.status === 'Active' ? 'success' : 'default'}
                    size="small"
                    sx={{ fontWeight: 600 }}
                  />
                </Grid>
              </Grid>
            </Box>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card elevation={2} sx={{ borderRadius: 3, height: '100%', border: '1px solid', borderColor: '#e8f5e9' }}>
            <Box sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <HowToVote fontSize="small" color="primary" />
                {isVoter ? 'Voting Status' : 'Account Access'}
              </Typography>
              <Divider sx={{ mb: 3 }} />
              <Box sx={{ textAlign: 'center' }}>
                {isVoter && voteCount > 0 ? (
                  <>
                    <CheckCircle sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'success.main' }}>
                      {voteCount}
                    </Typography>
                    <Typography variant="body2" color="success.main" sx={{ fontWeight: 600 }}>
                      Positions voted
                    </Typography>
                  </>
                ) : isVoter ? (
                  <>
                    <Schedule sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.disabled' }}>
                      0
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      No votes cast yet
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    This account has administrative access and does not cast votes.
                  </Typography>
                )}
              </Box>
            </Box>
          </Card>
        </Grid>
      </Grid>

      <Card elevation={2} sx={{ borderRadius: 3, mt: 3, border: '1px solid', borderColor: '#e8f5e9' }}>
        <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Lock fontSize="small" color="primary" />
              Account security
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Change your password using your current password.
            </Typography>
          </Box>
          <Button variant="outlined" startIcon={<Lock />} onClick={handleOpenPassword} sx={{ borderRadius: 2 }}>
            Change password
          </Button>
        </Box>
      </Card>

      <Dialog open={formOpen} onClose={() => !saving && setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Edit Profile
          <IconButton onClick={() => setFormOpen(false)} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {photoPreview ? (
            <Box
              component="img"
              src={photoPreview}
              alt="Profile Preview"
              sx={{
                width: '100%',
                maxWidth: 200,
                height: 150,
                objectFit: 'cover',
                borderRadius: 2,
                mx: 'auto',
                display: 'block',
                mb: 2,
              }}
            />
          ) : (
            <Avatar
              sx={{
                width: 100,
                height: 100,
                mx: 'auto',
                mb: 2,
                fontSize: '2rem',
                bgcolor: 'primary.main',
              }}
            >
              {currentUser.name?.charAt(0)?.toUpperCase() || 'U'}
            </Avatar>
          )}

          <Button
            variant="outlined"
            component="label"
            startIcon={<PhotoCamera />}
            fullWidth
            sx={{ mb: 3, borderRadius: 2 }}
          >
            Upload ID Photo
            <input type="file" hidden accept="image/jpeg,image/png" onChange={handlePhotoChange} />
          </Button>
          {formErrors.idPhoto && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formErrors.idPhoto}
            </Alert>
          )}

          {currentUser.role !== 'admin' && nationalIdPreview && (
            <Box component="img" src={nationalIdPreview} alt="National ID preview" sx={{ width: '100%', maxWidth: 320, maxHeight: 180, objectFit: 'contain', borderRadius: 2, mx: 'auto', display: 'block', mb: 2 }} />
          )}
          {currentUser.role !== 'admin' && (
            <>
              <Button variant="outlined" component="label" startIcon={<Badge />} fullWidth sx={{ mb: 1, borderRadius: 2 }}>
                Upload National ID
                <input type="file" hidden required={!nationalIdPreview} accept="image/jpeg,image/png" onChange={handleNationalIdChange} />
              </Button>
              {formErrors.nationalIdDocument && <Alert severity="error" sx={{ mb: 2 }}>{formErrors.nationalIdDocument}</Alert>}
            </>
          )}

          <TextField
            fullWidth
            required
            label="Full Name"
            inputProps={{ maxLength: 120 }}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={!!formErrors.name}
            helperText={formErrors.name}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            required
            label="Email Address"
            type="email"
            inputProps={{ maxLength: 255 }}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            error={!!formErrors.email}
            helperText={formErrors.email || 'Valid email format required'}
            sx={{ mb: 2 }}
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              select
              required
              label="Polling District"
              value={form.pollingDistrict}
              disabled
              error={!!formErrors.pollingDistrict}
              helperText={formErrors.pollingDistrict || 'Polling district is managed by an administrator.'}
            >
              {districts.map((d) => (
                <MenuItem key={d} value={d}>
                  {d}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              required
              label="Status"
              value={form.status}
              disabled
              helperText="Account status is managed by an administrator."
            >
              <MenuItem value="Active">Active</MenuItem>
              <MenuItem value="Inactive">Inactive</MenuItem>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setFormOpen(false)} disabled={saving} variant="outlined" sx={{ borderRadius: 2 }}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving} variant="contained" sx={{ borderRadius: 2 }}>
            {saving ? 'Saving...' : 'Update Profile'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={passwordOpen} onClose={() => !passwordSaving && setPasswordOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Change password
          <IconButton onClick={() => !passwordSaving && setPasswordOpen(false)} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Your new password must contain at least 8 characters, an uppercase letter, a number, and a special character.
          </Typography>
          <TextField
            fullWidth
            required
            autoFocus
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={passwordForm.currentPassword}
            onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })}
            error={!!passwordFormErrors.currentPassword}
            helperText={passwordFormErrors.currentPassword}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            required
            label="New password"
            type="password"
            autoComplete="new-password"
            value={passwordForm.newPassword}
            onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })}
            error={!!passwordFormErrors.newPassword}
            helperText={passwordFormErrors.newPassword || 'Use uppercase, number, and special character.'}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            required
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={passwordForm.confirmPassword}
            onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })}
            error={!!passwordFormErrors.confirmPassword}
            helperText={passwordFormErrors.confirmPassword}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setPasswordOpen(false)} disabled={passwordSaving} variant="outlined" sx={{ borderRadius: 2 }}>
            Cancel
          </Button>
          <Button onClick={handlePasswordSubmit} disabled={passwordSaving} variant="contained" sx={{ borderRadius: 2 }}>
            {passwordSaving ? 'Changing...' : 'Change password'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
