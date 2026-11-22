export const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()) && value.trim().length <= 255;

export const validPersonName = (value) => {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.length <= 120 && /^[\p{L}][\p{L}\p{M} .'’-]*$/u.test(trimmed);
};

export const validCode = (value) => /^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(value.trim());

export const validPassword = (value) => value.length >= 8
  && /[A-Z]/.test(value)
  && /[0-9]/.test(value)
  && /[!@#$%^&*(),.?":{}|<>]/.test(value);

export const textLimit = (value, max) => value.length <= max;

export const requiredText = (label, max = 255) => (value) => {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required.`;
  if (trimmed.length > max) return `${label} must be ${max} characters or fewer.`;
  return '';
};

export const optionalText = (label, max = 255) => (value) => (
  value.trim().length > max ? `${label} must be ${max} characters or fewer.` : ''
);

export const emailError = (value) => (!value.trim() ? 'Email is required.' : validEmail(value) ? '' : 'Enter a valid email address.');
export const nameError = (value) => (!value.trim() ? 'Name is required.' : validPersonName(value) ? '' : 'Use 2–120 letters, spaces, apostrophes, periods, or hyphens.');
export const passwordError = (value) => (!value ? 'Password is required.' : validPassword(value) ? '' : 'Use 8+ characters with uppercase, number, and special character.');

export const partyFieldErrors = (form) => ({
  name: requiredText('Party name', 120)(form.name),
  email: emailError(form.email),
  abbreviation: !form.abbreviation.trim()
    ? 'Abbreviation is required.'
    : validCode(form.abbreviation) ? '' : 'Use 2–32 letters, numbers, hyphens, or underscores.',
  slogan: requiredText('Slogan', 500)(form.slogan),
  logo: form.logo ? '' : 'Party logo is required.',
});
