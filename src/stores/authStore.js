import { create } from 'zustand';
import { apiRequest } from '../lib/api';

const getStoredUser = () => {
  try {
    if (!localStorage.getItem('voting_auth_token')) return null;
    const stored = localStorage.getItem('voting_currentUser');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const getInitialVotedPositions = () => {
  const user = getStoredUser();
  return user?.votedPositions && user.voterId
    ? { [user.voterId]: user.votedPositions }
    : {};
};

const getStoredToken = () => localStorage.getItem('voting_auth_token');

export const useAuthStore = create((set) => ({
  currentUser: getStoredUser(),
  votedPositions: getInitialVotedPositions(),

  login: (user, token) => {
    if (!user) return false;

    const authToken = token || getStoredToken();
    const normalizedUser = {
      ...user,
      role: String(user.role || '').toLowerCase(),
    };
    set({
      currentUser: normalizedUser,
      votedPositions: normalizedUser.votedPositions && normalizedUser.voterId
        ? { [normalizedUser.voterId]: normalizedUser.votedPositions }
        : {},
    });
    localStorage.setItem('voting_currentUser', JSON.stringify(normalizedUser));
    if (authToken) {
      localStorage.setItem('voting_auth_token', authToken);
    }
    return true;
  },

  logout: () => {
    apiRequest('/logout.php', { method: 'POST' }).catch(() => {});
    set({ currentUser: null, votedPositions: {} });
    localStorage.removeItem('voting_currentUser');
    localStorage.removeItem('voting_auth_token');
  },

  markVoted: (voterId, position, candidateId) => {
    set((state) => {
      const userVotes = {
        ...(state.votedPositions[voterId] || {}),
        [position]: candidateId,
      };
      const votedPositions = {
        ...state.votedPositions,
        [voterId]: userVotes,
      };
      const currentUser = state.currentUser?.voterId === voterId
        ? { ...state.currentUser, votedPositions: userVotes }
        : state.currentUser;

      if (currentUser) {
        localStorage.setItem('voting_currentUser', JSON.stringify(currentUser));
      }

      return { currentUser, votedPositions };
    });
  },

  hasUserVotedForPosition: (voterId, position) => {
    const { votedPositions } = useAuthStore.getState();
    return !!(votedPositions[voterId] && votedPositions[voterId][position]);
  },

  hasUserVoted: (voterId) => {
    const { votedPositions } = useAuthStore.getState();
    return !!(votedPositions[voterId] && Object.keys(votedPositions[voterId]).length > 0);
  },
}));
