import { useState } from 'react';
import { TextField } from '@mui/material';

export default function ValidatedTextField({ validate, helperText, error, onChange, value, ...props }) {
  const [touched, setTouched] = useState(false);

  const handleChange = (event) => {
    setTouched(true);
    onChange?.(event);
  };

  const handleBlur = (event) => {
    setTouched(true);
    props.onBlur?.(event);
  };

  const externalErrorText = typeof error === 'string' ? error : '';
  const validationError = touched && validate ? validate(String(value ?? '')) : '';

  return (
    <TextField
      {...props}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      error={Boolean(error || validationError)}
      helperText={externalErrorText || validationError || helperText}
    />
  );
}
