import { create } from 'zustand';
import { apiRequest } from '../lib/api';
import { useAuthStore } from './authStore';

const emptyState = {
  candidates: [],
  voters: [],
  users: [],
  positions: [],
  elections: [],
  districts: [],
  parties: [],
  analytics: null,
  loading: false,
  error: '',
};

export const useDataStore = create((set, get) => ({
  ...emptyState,

  loadData: async () => {
    set({ loading: true, error: '' });
    try {
      const currentUser = useAuthStore.getState().currentUser;
      const isAdmin = currentUser?.role === 'admin';
      const [candidateResponse, voterResponse, userResponse, positionResponse, electionResponse, districtResponse, partyResponse, analyticsResponse] = await Promise.all([
        apiRequest('/candidates.php'),
        isAdmin ? apiRequest('/voters.php') : Promise.resolve({ voters: [] }),
        isAdmin ? apiRequest('/users.php') : Promise.resolve({ users: [] }),
        apiRequest('/positions.php'),
        apiRequest('/elections.php'),
        isAdmin ? apiRequest('/polling_districts.php') : Promise.resolve({ districts: [] }),
        apiRequest('/political_parties.php'),
        isAdmin ? apiRequest('/analytics.php') : Promise.resolve(null),
      ]);
      set({
        candidates: candidateResponse.candidates || [],
        voters: voterResponse.voters || [],
        users: userResponse.users || [],
        positions: positionResponse.positions || [],
        elections: electionResponse.elections || [],
        districts: districtResponse.districts || [],
        parties: partyResponse.parties || [],
        analytics: analyticsResponse,
        loading: false,
      });
      return true;
    } catch (error) {
      set({ loading: false, error: error.message });
      return false;
    }
  },

  refreshAnalytics: async () => {
    const response = await apiRequest('/analytics.php');
    set({ analytics: response });
    return response;
  },

  addCandidate: async (candidate) => {
    const response = await apiRequest('/candidates.php', {
      method: 'POST',
      body: JSON.stringify(candidate),
    });
    set((state) => ({ candidates: [...state.candidates, response.candidate] }));
    return response.candidate;
  },

  updateCandidate: async (id, data) => {
    const response = await apiRequest(`/candidates.php?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    set((state) => ({
      candidates: state.candidates.map((candidate) => (
        candidate.id === id ? response.candidate : candidate
      )),
    }));
    return response.candidate;
  },

  setCandidateStatus: async (id, status) => {
    const response = await apiRequest(`/candidates.php?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    set((state) => ({
      candidates: state.candidates.map((candidate) => (
        candidate.id === id ? response.candidate : candidate
      )),
    }));
    return response.candidate;
  },

  deleteCandidate: async (id) => {
    await apiRequest(`/candidates.php?id=${id}`, { method: 'DELETE' });
    set((state) => ({
      candidates: state.candidates.filter((candidate) => candidate.id !== id),
    }));
  },

  getCandidateById: (id) => get().candidates.find((candidate) => candidate.id === id),

  getCandidatesByPosition: (position) => (
    get().candidates.filter((candidate) => candidate.position === position)
  ),

  addPosition: async (position) => {
    const response = await apiRequest('/positions.php', {
      method: 'POST',
      body: JSON.stringify(position),
    });
    set((state) => ({
      positions: [...state.positions, response.position].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return response.position;
  },

  updatePosition: async (id, position) => {
    const response = await apiRequest(`/positions.php?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(position),
    });
    set((state) => ({
      positions: state.positions
        .map((item) => (item.id === id ? response.position : item))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return response.position;
  },

  deletePosition: async (id) => {
    await apiRequest(`/positions.php?id=${id}`, { method: 'DELETE' });
    set((state) => ({
      positions: state.positions.filter((position) => position.id !== id),
    }));
  },

  addElection: async (election) => {
    const response = await apiRequest('/elections.php', {
      method: 'POST',
      body: JSON.stringify(election),
    });
    set((state) => ({ elections: [response.election, ...state.elections] }));
    return response.election;
  },

  updateElection: async (id, election) => {
    const response = await apiRequest(`/elections.php?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(election),
    });
    set((state) => ({
      elections: state.elections.map((item) => (item.id === id ? response.election : item)),
    }));
    return response.election;
  },

  closeElection: async (id) => {
    await apiRequest(`/elections.php?id=${id}`, { method: 'DELETE' });
    set((state) => ({
      elections: state.elections.map((item) => (item.id === id ? { ...item, status: 'Closed' } : item)),
    }));
  },

  reopenElection: async (id) => {
    const response = await apiRequest(`/elections.php?id=${id}&action=reopen`, {
      method: 'POST',
    });
    set((state) => ({
      elections: state.elections.map((item) => (item.id === id ? response.election : item)),
    }));
    return response.election;
  },

  publishElection: async (id) => {
    const response = await apiRequest(`/elections.php?id=${id}&action=publish-results`, {
      method: 'POST',
    });
    set((state) => ({
      elections: state.elections.map((item) => (item.id === id ? response.election : item)),
    }));
    return response.election;
  },

  addDistrict: async (district) => {
    const response = await apiRequest('/polling_districts.php', {
      method: 'POST',
      body: JSON.stringify(district),
    });
    set((state) => ({ districts: [...state.districts, response.district].sort((a, b) => a.name.localeCompare(b.name)) }));
    return response.district;
  },

  updateDistrict: async (id, district) => {
    const response = await apiRequest(`/polling_districts.php?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(district),
    });
    set((state) => ({ districts: state.districts.map((item) => (item.id === id ? response.district : item)) }));
    return response.district;
  },

  deactivateDistrict: async (id) => {
    await apiRequest(`/polling_districts.php?id=${id}`, { method: 'DELETE' });
    set((state) => ({ districts: state.districts.map((item) => (item.id === id ? { ...item, status: 'Inactive' } : item)) }));
  },

  deleteDistrict: async (id) => {
    await apiRequest(`/polling_districts.php?id=${id}`, { method: 'DELETE' });
    set((state) => ({ districts: state.districts.filter((item) => item.id !== id) }));
  },

  addVoter: async (voter) => {
    const response = await apiRequest('/voters.php', {
      method: 'POST',
      body: JSON.stringify(voter),
    });
    set((state) => ({ voters: [...state.voters, response.voter] }));
    return response.voter;
  },

  updateVoter: async (id, data) => {
    const response = await apiRequest(`/voters.php?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    set((state) => ({
      voters: state.voters.map((voter) => (voter.id === id ? response.voter : voter)),
    }));
    return response.voter;
  },

  updateUser: async (id, data) => {
    const response = await apiRequest(`/users.php?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    set((state) => ({
      users: state.users.map((user) => (user.id === id ? response.user : user)),
    }));
    if (useAuthStore.getState().currentUser?.id === id) {
      useAuthStore.getState().login(response.user);
    }
    return response.user;
  },

  updateProfile: async (data) => {
    const response = await apiRequest('/profile.php', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    useAuthStore.getState().login(response.user);
    set((state) => ({
      users: state.users.map((user) => (user.id === response.user.id ? response.user : user)),
      voters: state.voters.map((voter) => (voter.id === response.user.id ? response.user : voter)),
    }));
    return response.user;
  },

  changePassword: async (data) => {
    const response = await apiRequest('/change_password.php', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response;
  },

  setVoterStatus: async (id, status) => {
    const response = await apiRequest(`/voters.php?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    set((state) => ({
      voters: state.voters.map((voter) => (voter.id === id ? response.voter : voter)),
    }));
    return response.voter;
  },

  deleteVoter: async (id) => {
    await apiRequest(`/voters.php?id=${id}`, { method: 'DELETE' });
    set((state) => ({
      voters: state.voters.filter((voter) => voter.id !== id),
      users: state.users.filter((user) => user.id !== id),
    }));
  },

  getVoterById: (id) => get().voters.find((voter) => voter.id === id),

  getVoterByVoterId: (voterId) => get().voters.find((voter) => voter.voterId === voterId),

  castVote: async (candidateId, voterId, position) => {
    const response = await apiRequest('/votes.php', {
      method: 'POST',
      body: JSON.stringify({ candidateId, voterId, position }),
    });
    set((state) => ({
      candidates: state.candidates.map((candidate) => (
        candidate.id === response.candidate.id
          ? { ...candidate, votes: response.candidate.votes }
          : candidate
      )),
      voters: state.voters.map((voter) => (
        voter.voterId === response.voterId
          ? {
              ...voter,
              votedPositions: {
                ...(voter.votedPositions || {}),
                [response.position]: response.candidate.id,
              },
              hasVoted: true,
            }
          : voter
      )),
    }));
    return response;
  },

  authenticateUser: async (identifier, password) => {
    try {
      const response = await apiRequest('/login.php', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      if (!response.user || !response.token) {
        return {
          success: false,
          reason: 'invalidLoginResponse',
          message: 'The server returned an incomplete login response.',
        };
      }
      return { success: true, user: response.user, token: response.token };
    } catch (error) {
      return { success: false, reason: error.code || 'loginFailed', message: error.message };
    }
  },

  registerVoter: async (voter) => {
    try {
      const response = await apiRequest('/register.php', {
        method: 'POST',
        body: JSON.stringify(voter),
      });
      return { success: true, user: response.user, token: response.token };
    } catch (error) {
      return { success: false, reason: error.code || 'registrationFailed', message: error.message };
    }
  },

  resetVoting: async () => {
    await apiRequest('/reset.php', { method: 'POST' });
    await get().loadData();
  },

  resetAll: async () => {
    await apiRequest('/reset.php', { method: 'POST' });
    await get().loadData();
  },
}));
