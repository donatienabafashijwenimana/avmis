import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Button, Card, CardContent, Alert, Typography } from '@mui/material';
import { LockReset } from '@mui/icons-material';
import { apiRequest } from '../lib/api';
import ValidatedTextField from '../components/ValidatedTextField';
import AuthBrandPanel from '../components/auth/AuthBrandPanel';
import { passwordError, validPassword } from '../lib/validation';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(token ? '' : 'This password reset link is missing or invalid.');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!token) {
      setError('This password reset link is missing or invalid.');
      return;
    }
    if (!validPassword(password)) {
      setError(passwordError(password));
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiRequest('/password_reset.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'reset', token, password }),
      });
      setSuccess(response.message || 'Your password has been reset.');
      setPassword('');
      setConfirmPassword('');
    } catch (requestError) {
      setError(requestError.message || 'This password reset link is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box className="auth-page">
      <Card className="auth-card" elevation={0}>
        <AuthBrandPanel
          title="A fresh start is one step away."
          description="Choose a new password and return to secure, simple election participation."
          items={['Reset access securely', 'Keep your account protected', 'Return to voting with confidence']}
        />
        <CardContent className="auth-form-panel">
          <Box className="auth-form-panel__header">
            <Box className="auth-form-panel__mobile-logo"><LockReset /></Box>
            <Typography className="auth-form-panel__eyebrow">Account recovery</Typography>
            <Typography component="h2" className="auth-form-panel__title">Set a new password</Typography>
            <Typography className="auth-form-panel__subtitle">Choose a strong password for your voting account.</Typography>
          </Box>
          {error && <Alert severity="error" sx={{ mb: 3, borderRadius: '10px' }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 3, borderRadius: '10px' }}>{success}</Alert>}
          {!success && (
            <Box component="form" onSubmit={handleSubmit}>
              <ValidatedTextField
                required
                fullWidth
                label="New password"
                type="password"
                value={password}
                validate={passwordError}
                onChange={(event) => setPassword(event.target.value)}
                helperText="Uppercase, number, special character, 8+ chars"
                sx={{ mb: 2 }}
              />
              <ValidatedTextField
                required
                fullWidth
                label="Confirm new password"
                type="password"
                value={confirmPassword}
                validate={(value) => value === password ? '' : 'Passwords do not match.'}
                onChange={(event) => setConfirmPassword(event.target.value)}
                sx={{ mb: 3 }}
              />
              <Button type="submit" fullWidth variant="contained" disabled={submitting} className="auth-submit-button">
                {submitting ? 'Resetting password…' : 'Reset password'}
              </Button>
            </Box>
          )}
          <Button type="button" fullWidth onClick={() => navigate('/')} sx={{ mt: 2 }}>
            Back to login
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
