import { Box, Chip, Typography } from '@mui/material';
import { CheckCircle, HowToVote, Lock, VerifiedUser } from '@mui/icons-material';
import electionIllustration from '../../assets/election-illustration.svg';

const defaultItems = [
  'Secure access for every eligible voter',
  'Simple, transparent election participation',
  'Your choices remain private and protected',
];

export default function AuthBrandPanel({ title = 'Your voice matters.', description, items = defaultItems }) {
  return (
    <Box className="auth-brand-panel">
      <Box className="auth-brand-panel__content">
        <Box className="auth-brand-panel__logo">
          <Box className="auth-brand-panel__logo-mark"><HowToVote /></Box>
          <Typography component="span">VoteSphere</Typography>
        </Box>

        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Chip icon={<VerifiedUser />} label="Trusted digital elections" className="auth-brand-panel__chip" />
          <Typography component="h1" className="auth-brand-panel__title">{title}</Typography>
          <Typography className="auth-brand-panel__description">
            {description || 'A secure and accessible way to take part in the decisions that shape your community.'}
          </Typography>
          <Box className="auth-brand-panel__features">
            {items.map((item) => (
              <Box key={item} className="auth-brand-panel__feature">
                <CheckCircle />
                <Typography>{item}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        <Box className="auth-brand-panel__art" aria-hidden="true">
          <Box className="auth-brand-panel__glow" />
          <Box component="img" src={electionIllustration} alt="Election ballot illustration" />
        </Box>

        <Box className="auth-brand-panel__footer">
          <Lock />
          <Typography>Protected by secure account verification</Typography>
        </Box>
      </Box>
    </Box>
  );
}
