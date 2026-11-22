import { createTheme, ThemeProvider as MUIThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { useMemo } from 'react';
import { useThemeStore } from './themeStoreCore';

export function ThemeProvider({ children }) {
  const mode = useThemeStore((s) => s.mode);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: {
            main: '#2e7d32',
            light: '#66bb6a',
            dark: '#1b5e20',
          },
          secondary: {
            main: '#7c3aed',
            light: '#a78bfa',
            dark: '#4c1d95',
          },
          background: {
            default: mode === 'light' ? '#f7faf7' : '#0b0f0c',
            paper: mode === 'light' ? '#ffffff' : '#111813',
          },
        },
        typography: {
          fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
          h4: { fontWeight: 700 },
          h5: { fontWeight: 700 },
          h6: { fontWeight: 700 },
        },
        components: {
          MuiButton: {
            styleOverrides: {
              root: {
                textTransform: 'none',
                borderRadius: 10,
              },
            },
          },
          MuiCard: {
            styleOverrides: {
              root: {
                borderRadius: 14,
              },
            },
          },
          MuiDialog: {
            styleOverrides: {
              paper: {
                borderRadius: 16,
              },
            },
          },
        },
      }),
    [mode]
  );

  return (
    <MUIThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MUIThemeProvider>
  );
}
