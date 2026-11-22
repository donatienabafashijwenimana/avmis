import { Box, IconButton, Tooltip } from '@mui/material';

export default function TableActions({ actions = [] }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.25 }}>
      {actions.filter((action) => action && action.show !== false).map((action) => (
        <Tooltip key={action.key || action.label} title={action.label}>
          <span>
            <IconButton
              size="small"
              color={action.color || 'default'}
              aria-label={action.label}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.icon}
            </IconButton>
          </span>
        </Tooltip>
      ))}
    </Box>
  );
}
