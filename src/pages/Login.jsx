import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  MenuItem,
} from '@mui/material';
import { HowToVote, Visibility, VisibilityOff, Login as LoginIcon, PhotoCamera, Badge } from '@mui/icons-material';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { apiRequest } from '../lib/api';
import ValidatedTextField from '../components/ValidatedTextField';
import AuthBrandPanel from '../components/auth/AuthBrandPanel';
import { emailError, nameError, passwordError, requiredText, validEmail } from '../lib/validation';

const districts = [
  'District A - Kigali',
  'District B - Huye',
  'District C - Musanze',
  'District D - Rubavu',
  'District E - Muhanga',
  'District F - Nyagatare',
  'District G - Rusizi',
];

const emptyRegistration = {
  voterId: '',
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  pollingDistrict: '',
  accountType: 'voter',
  party: '',
  candidateNationalId: '',
  nationalIdDocument: '',
  candidateNumber: '',
  biography: '',
  photo: '',
};

// ─── Main Component ─────────────────────────────────────────
export default function LoginPage() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [registration, setRegistration] = useState(emptyRegistration);
  const [photoPreview, setPhotoPreview] = useState('');
  const [nationalIdPreview, setNationalIdPreview] = useState('');
  const [parties, setParties] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const authenticateUser = useDataStore((s) => s.authenticateUser);
  const registerVoter = useDataStore((s) => s.registerVoter);
  const loadData = useDataStore((s) => s.loadData);

  useEffect(() => {
    if (!registerMode) return;
    apiRequest('/political_parties.php')
      .then((partyResponse) => setParties(partyResponse.parties || []))
      .catch(() => {
        setParties([]);
      });
  }, [registerMode]);

  const validate = () => {
    const newErrors = {};
    if (registerMode) {
      if (registration.accountType === 'candidate') {
        if (!/^[A-Za-z0-9_-]{4,32}$/.test(registration.voterId)) {
          newErrors.voterId = 'Username must be 4 to 32 letters, numbers, underscores, or hyphens';
        }
        if (!/^1[12]\d{14}$/.test(registration.candidateNationalId)) {
          newErrors.candidateNationalId = 'Candidate National ID must start with 11 or 12 and contain exactly 16 digits';
        }
        if (!registration.candidateNumber.trim()) newErrors.candidateNumber = 'Candidate number is required';
        if (!registration.biography.trim()) newErrors.biography = 'Biography is required';
        if (!registration.photo) newErrors.photo = 'Candidate photo is required';
      } else if (!/^1[12]\d{14}$/.test(registration.voterId)) {
        newErrors.voterId = 'National ID must start with 11 or 12 and contain exactly 16 digits';
      }
      const nameValidationError = nameError(registration.name);
      if (nameValidationError) newErrors.name = nameValidationError;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registration.email)) {
        newErrors.email = 'Enter a valid email address';
      }
      if (registration.accountType === 'candidate' && !registration.party) {
        newErrors.party = 'Party is required';
      }
      if (!registration.nationalIdDocument) {
        newErrors.nationalIdDocument = 'National ID document is required';
      }
      if (registration.accountType === 'voter' && !registration.pollingDistrict) {
        newErrors.pollingDistrict = 'Choose a polling district';
      }
      if (!registration.password) {
        newErrors.password = 'Password is required';
      } else {
        const checks = [];
        if (!/[A-Z]/.test(registration.password)) checks.push('uppercase letter');
        if (!/[0-9]/.test(registration.password)) checks.push('number');
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(registration.password)) checks.push('special character');
        if (registration.password.length < 8) checks.push('8+ characters');
        if (checks.length) newErrors.password = `Add: ${checks.join(', ')}`;
      }
      if (registration.password !== registration.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    } else if (forgotMode) {
      if (!validEmail(forgotEmail)) newErrors.forgotEmail = 'Enter a valid email address';
    } else {
      if (!loginId.trim()) newErrors.loginId = 'Voter ID, email, or admin username is required';
      if (!password) newErrors.password = 'Password is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!validate()) return;

    if (forgotMode) {
      try {
        const response = await apiRequest('/password_reset.php', {
          method: 'POST',
          body: JSON.stringify({ action: 'request', email: forgotEmail.trim() }),
        });
        setSuccess(response.message || 'If an active account uses that email, a password reset link has been sent.');
      } catch (requestError) {
        setError(requestError.message || 'Password recovery could not be started.');
      }
      return;
    }

    if (registerMode) {
      const result = await registerVoter({
        accountType: registration.accountType,
        voterId: registration.voterId,
        name: registration.name.trim(),
        email: registration.email.trim(),
        password: registration.password,
        pollingDistrict: registration.pollingDistrict,
        party: registration.party,
        candidateNationalId: registration.candidateNationalId,
        nationalIdDocument: registration.nationalIdDocument,
        candidateNumber: registration.candidateNumber,
        biography: registration.biography,
        photo: registration.photo,
      });
      if (result.success) {
        if (registration.accountType === 'candidate' && result.user && result.token) {
          login(result.user, result.token);
          navigate('/candidate/positions');
          loadData().catch(() => {});
          return;
        }
        setRegisterMode(false);
        setLoginId(registration.email.trim());
        setPassword('');
        setRegistration(emptyRegistration);
        setErrors({});
        setSuccess('Registration submitted. An administrator must activate your account before you can log in.');
      } else {
        setError(result.message || 'Registration could not be completed.');
      }
      return;
    }

    const authResult = await authenticateUser(loginId.trim(), password);
    if (authResult.success) {
      const loggedIn = login(authResult.user, authResult.token);
      if (!loggedIn) {
        setError('The server returned incomplete account details. Please try again.');
        return;
      }
      if (String(authResult.user.role || '').toLowerCase() === 'candidate') {
        navigate('/candidate/positions');
        loadData().catch(() => {});
        return;
      }
      const dataLoaded = await loadData();
      if (!dataLoaded) {
        logout();
        setError('Login succeeded, but the authenticated API request failed. Restart the PHP backend and try again.');
        return;
      }
      const destination = authResult.user.role === 'admin'
        ? '/dashboard'
        : authResult.user.role === 'candidate' ? '/candidate/positions' : '/voting';
      navigate(destination);
    } else {
      switch (authResult.reason) {
        case 'network_error':
          setError('The server is unavailable. Start the PHP backend and try again.');
          break;
        case 'invalid_api_response':
          setError(authResult.message);
          break;
        default:
          setError(authResult.message || 'Invalid credentials or inactive account. Please check and try again.');
      }
    }
  };

  const handleModeChange = () => {
    setRegisterMode((mode) => !mode);
    setForgotMode(false);
    setError('');
    setSuccess('');
    setErrors({});
    setPhotoPreview('');
    setNationalIdPreview('');
  };

  const handleForgotMode = () => {
    setForgotMode(true);
    setRegisterMode(false);
    setError('');
    setSuccess('');
    setErrors({});
  };

  const handleBackToLogin = () => {
    setForgotMode(false);
    setError('');
    setSuccess('');
    setErrors({});
  };

  const handleCandidatePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setErrors((current) => ({ ...current, photo: 'Only JPEG or PNG files are allowed' }));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrors((current) => ({ ...current, photo: 'Photo must be under 2MB' }));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result);
      setRegistration((current) => ({ ...current, photo: reader.result }));
      setErrors((current) => ({ ...current, photo: '' }));
    };
    reader.readAsDataURL(file);
  };

  const handleNationalIdChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setErrors((current) => ({ ...current, nationalIdDocument: 'Only JPEG or PNG files are allowed' }));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrors((current) => ({ ...current, nationalIdDocument: 'National ID must be under 2MB' }));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setNationalIdPreview(reader.result);
      setRegistration((current) => ({ ...current, nationalIdDocument: reader.result }));
      setErrors((current) => ({ ...current, nationalIdDocument: '' }));
    };
    reader.readAsDataURL(file);
  };


  return (
    <Box className="auth-page">
      <Card className="auth-card" elevation={0}>
        <AuthBrandPanel
          title={registerMode ? 'Join the future of voting.' : forgotMode ? 'Get back to your account.' : 'Your voice matters.'}
          description={registerMode
            ? 'Create your secure account and take part in transparent, accessible elections.'
            : forgotMode
              ? 'Recover your account securely and continue participating in the decisions that matter.'
              : 'Make your voice heard through a secure, simple, and transparent digital election experience.'}
        />
        <CardContent className="auth-form-panel">
          <Box className="auth-form-panel__header">
            <Box className="auth-form-panel__mobile-logo"><HowToVote /></Box>
            <Box>
              <Typography className="auth-form-panel__eyebrow">Automated Voting System</Typography>
              <Typography component="h2" className="auth-form-panel__title">
                {registerMode ? 'Create your account' : forgotMode ? 'Forgot your password?' : 'Login'}
              </Typography>
              <Typography className="auth-form-panel__subtitle">
                {registerMode ? 'Complete the form below to get started.' : forgotMode ? 'Enter your email and we will send you a secure reset link.' : 'Sign in to continue to dashboard.'}
              </Typography>
            </Box>
            {!forgotMode && (
              <Typography className="auth-form-panel__switch">
                {registerMode ? 'Already registered?' : 'New here?'}{' '}
                <Button type="button" onClick={handleModeChange} className="auth-link-button">
                  {registerMode ? 'Sign in' : 'Create account'}
                </Button>
              </Typography>
            )}
          </Box>

          {error && (
            <Alert
              severity="error"
              sx={{
                mb: 3,
                borderRadius: '10px',
                border: '1px solid rgba(211, 47, 47, 0.2)',
              }}
            >
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 3, borderRadius: '10px' }}>
              {success}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            {registerMode ? (
              <>
                <TextField
                  select
                  required
                  fullWidth
                  label="Account type"
                  value={registration.accountType}
                  onChange={(e) => {
                    setRegistration({
                      ...registration,
                      accountType: e.target.value,
                      party: '',
                      candidateNationalId: '',
                      candidateNumber: '',
                      biography: '',
                      photo: '',
                      nationalIdDocument: '',
                    });
                    setNationalIdPreview('');
                    setPhotoPreview('');
                  }}
                  sx={{ mb: 2 }}
                >
                  <MenuItem value="voter">Voter — vote only</MenuItem>
                  <MenuItem value="candidate">Candidate — apply for a position later</MenuItem>
                </TextField>
                {registration.accountType === 'voter' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
                  <ValidatedTextField
                    required
                    fullWidth
                    label="Voter ID"
                    value={registration.voterId}
                    validate={(value) => /^1[12]\d{14}$/.test(value) ? '' : 'Use 16 digits starting with 11 or 12.'}
                    onChange={(e) => setRegistration({
                      ...registration,
                      voterId: e.target.value.replace(/\D/g, ''),
                    })}
                    error={!!errors.voterId}
                    helperText={errors.voterId || '16 digits starting with 11 or 12'}
                  />
                  <ValidatedTextField
                    required
                    fullWidth
                    label="Full name"
                    value={registration.name}
                    validate={nameError}
                    onChange={(e) => setRegistration({ ...registration, name: e.target.value })}
                    error={!!errors.name}
                    helperText={errors.name}
                  />
                  {nationalIdPreview && <Box component="img" src={nationalIdPreview} alt="National ID preview" sx={{ width: '100%', maxHeight: 130, objectFit: 'contain', borderRadius: 2, mb: 1 }} />}
                  <Button component="label" variant="outlined" startIcon={<Badge />} fullWidth sx={{ mb: 1 }}>
                    Upload National ID
                    <input hidden required={!registration.nationalIdDocument} type="file" accept="image/jpeg,image/png" onChange={handleNationalIdChange} />
                  </Button>
                  {errors.nationalIdDocument && <Typography variant="caption" color="error" sx={{ display: 'block', mb: 2 }}>{errors.nationalIdDocument}</Typography>}
                </Box>
                )}
                {registration.accountType === 'candidate' && (
                  <>
                    {photoPreview && (
                      <Box sx={{ mb: 1, textAlign: 'center' }}>
                        <Box component="img" src={photoPreview} alt="Candidate preview" sx={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover' }} />
                      </Box>
                    )}
                    <Button component="label" variant="outlined" startIcon={<PhotoCamera />} fullWidth sx={{ mb: 1 }}>
                      Upload candidate photo
                      <input hidden required={!registration.photo} type="file" accept="image/jpeg,image/png" onChange={handleCandidatePhotoChange} />
                    </Button>
                    {errors.photo && <Typography variant="caption" color="error" sx={{ display: 'block', mb: 2 }}>{errors.photo}</Typography>}
                    {nationalIdPreview && <Box component="img" src={nationalIdPreview} alt="National ID preview" sx={{ width: '100%', maxHeight: 130, objectFit: 'contain', borderRadius: 2, mb: 1 }} />}
                    <Button component="label" variant="outlined" startIcon={<Badge />} fullWidth sx={{ mb: 1 }}>
                      Upload National ID
                      <input hidden required={!registration.nationalIdDocument} type="file" accept="image/jpeg,image/png" onChange={handleNationalIdChange} />
                    </Button>
                    {errors.nationalIdDocument && <Typography variant="caption" color="error" sx={{ display: 'block', mb: 2 }}>{errors.nationalIdDocument}</Typography>}
                    <ValidatedTextField
                      required
                      fullWidth
                      label="Full Name"
                      value={registration.name}
                      validate={nameError}
                      onChange={(e) => setRegistration({ ...registration, name: e.target.value })}
                      error={!!errors.name}
                      helperText={errors.name}
                      sx={{ mb: 2 }}
                    />
                    <ValidatedTextField
                      required
                      fullWidth
                      label="Candidate Number"
                      value={registration.candidateNumber}
                      validate={(value) => (/^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/.test(value) ? '' : 'Use 1–32 letters, numbers, or hyphens.')}
                      inputProps={{ maxLength: 32 }}
                      onChange={(e) => setRegistration({ ...registration, candidateNumber: e.target.value.replace(/[^A-Za-z0-9-]/g, '') })}
                      error={!!errors.candidateNumber}
                      helperText={errors.candidateNumber || 'Unique identifier shown on the ballot.'}
                      sx={{ mb: 2 }}
                    />
                    <ValidatedTextField
                      required
                      fullWidth
                      label="Candidate National ID"
                      value={registration.candidateNationalId}
                      validate={(value) => /^1[12]\d{14}$/.test(value) ? '' : 'Use 16 digits starting with 11 or 12.'}
                      inputProps={{ maxLength: 16, inputMode: 'numeric' }}
                      onChange={(e) => setRegistration({ ...registration, candidateNationalId: e.target.value.replace(/\D/g, '') })}
                      error={!!errors.candidateNationalId}
                      helperText={errors.candidateNationalId || '16 digits starting with 11 or 12'}
                      sx={{ mb: 2 }}
                    />
                    <TextField
                      select
                      required
                      fullWidth
                      label="Party"
                      value={registration.party}
                      onChange={(e) => setRegistration({ ...registration, party: e.target.value })}
                      error={!!errors.party}
                      helperText={errors.party}
                      sx={{ mb: 2 }}
                    >
                      <MenuItem value="">Choose a party</MenuItem>
                      {parties.map((party) => (
                        <MenuItem key={party.id} value={party.name}>
                          {party.name}{party.abbreviation ? ` (${party.abbreviation})` : ''}
                        </MenuItem>
                      ))}
                    </TextField>
                    <ValidatedTextField
                      required
                      fullWidth
                      label="Biography"
                      multiline
                      rows={3}
                      value={registration.biography}
                      validate={requiredText('Biography', 2000)}
                      inputProps={{ maxLength: 2000 }}
                      onChange={(e) => setRegistration({ ...registration, biography: e.target.value })}
                      error={!!errors.biography}
                      helperText={errors.biography}
                      sx={{ mb: 2 }}
                    />
                    <ValidatedTextField
                      required
                      fullWidth
                      label="Candidate username"
                      value={registration.voterId}
                      validate={(value) => /^[A-Za-z0-9_-]{4,32}$/.test(value) ? '' : 'Use 4–32 letters, numbers, underscores, or hyphens.'}
                      onChange={(e) => setRegistration({ ...registration, voterId: e.target.value.replace(/[^A-Za-z0-9_-]/g, '') })}
                      error={!!errors.voterId}
                      helperText={errors.voterId || 'Account username used to sign in'}
                      sx={{ mb: 2 }}
                    />
                  </>
                  
                )}
                <ValidatedTextField
                  required
                  fullWidth
                  label={registration.accountType === 'candidate' ? 'Account email address' : 'Email address'}
                  type="email"
                  value={registration.email}
                  validate={emailError}
                  onChange={(e) => setRegistration({ ...registration, email: e.target.value })}
                  error={!!errors.email}
                  helperText={errors.email}
                  sx={{ mb: 2 }}
                />
                {registration.accountType === 'voter' && <TextField
                  select
                  required
                  fullWidth
                  label="Polling district"
                  value={registration.pollingDistrict}
                  onChange={(e) => setRegistration({ ...registration, pollingDistrict: e.target.value })}
                  error={!!errors.pollingDistrict}
                  helperText={errors.pollingDistrict}
                  sx={{ mb: 2 }}
                >
                  {districts.map((district) => <MenuItem key={district} value={district}>{district}</MenuItem>)}
                </TextField>}
                <Box sx={{ display: 'flex', gap: 2, mb: 3, flexDirection: { xs: 'column', md: 'row' } }}>
                  <ValidatedTextField
                    required
                    fullWidth
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    value={registration.password}
                    validate={passwordError}
                    onChange={(e) => setRegistration({ ...registration, password: e.target.value })}
                    error={!!errors.password}
                    helperText={errors.password || 'Uppercase, number, special character, 8+ chars'}
                  />
                  <ValidatedTextField
                    required
                    fullWidth
                    label="Confirm password"
                    type={showPassword ? 'text' : 'password'}
                    value={registration.confirmPassword}
                    validate={(value) => value === registration.password ? '' : 'Passwords do not match.'}
                    onChange={(e) => setRegistration({ ...registration, confirmPassword: e.target.value })}
                    error={!!errors.confirmPassword}
                    helperText={errors.confirmPassword}
                  />
                </Box>
              </>
            ) : forgotMode ? (
              <ValidatedTextField
                required
                fullWidth
                label="Account email address"
                type="email"
                value={forgotEmail}
                validate={(value) => validEmail(value) ? '' : 'Enter a valid email address.'}
                onChange={(e) => setForgotEmail(e.target.value)}
                error={errors.forgotEmail}
                helperText={errors.forgotEmail || 'We will email you a secure password reset link.'}
                sx={{ mb: 3 }}
              />
            ) : (
              <Box sx={{ display: 'flex', gap: 2, mb: 3, flexDirection: { xs: 'column', md: 'row' } }}>
                <ValidatedTextField
                  required
                  fullWidth
                  label="Email or Admin ID"
                  value={loginId}
                  validate={(value) => value.trim() ? '' : 'Voter ID, email, or admin username is required.'}
                  onChange={(e) => setLoginId(e.target.value)}
                  error={errors.loginId}
                  helperText={errors.loginId || 'Enter your email, admin ID, or candidate username'}
                  placeholder="Enter your email, Admin ID, or username"
                />
                <ValidatedTextField
                  required
                  fullWidth
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  validate={(value) => value ? '' : 'Password is required.'}
                  onChange={(e) => setPassword(e.target.value)}
                  error={errors.password}
                  helperText={errors.password || 'Enter your account password'}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
            )}

            <Button
              type="submit"
              variant="contained"
              size="medium"
              className="auth-submit-button"
              startIcon={<LoginIcon />}
            >
              {registerMode ? 'Submit Registration' : forgotMode ? 'Send Reset Link' : 'Login'}
            </Button>
            {forgotMode ? (
              <Button type="button" fullWidth onClick={handleBackToLogin} className="auth-secondary-button">
                Back to login
              </Button>
            ) : (
              null
            )}
            {!registerMode && !forgotMode && (
              <Button type="button" fullWidth onClick={handleForgotMode} className="auth-text-button">
                Forgot password?
              </Button>
            )}
            {!registerMode && !forgotMode && (
              <Button type="button" fullWidth onClick={() => navigate('/party-registration')} className="auth-text-button">
                Register a political party
              </Button>
            )}
          </Box>

        </CardContent>
      </Card>
    </Box>
  );
}
