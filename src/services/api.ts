export interface Tournament {
  id: number;
  name: string;
  date: string;
  location: string;
  format: string;
  organizer: string;
  logo: string;
  match_play_type: 'single_elimination' | 'double_elimination' | 'ladder' | 'stepladder' | 'playoff' | 'team_selection_playoff';
  qualified_count: number;
  playoff_winners_count: number;
  type: 'individual' | 'team';
  games_count: number;
  genders_rule: string;
  lanes_count: number;
  players_per_lane: number;
  players_per_team: number;
  shifts_count: number;
  oil_pattern: string;
  status: 'draft' | 'active' | 'finished';
  created_at: string;
}

export interface Participant {
  id: number;
  tournament_id: number;
  first_name: string;
  last_name: string;
  gender: string;
  hands?: string;
  club: string;
  average: number;
  email: string;
  team_id: number | null;
  team_order?: number;
  team_name?: string;
}

export interface Team {
  id: number;
  tournament_id: number;
  name: string;
}

export interface LaneAssignment {
  id: number;
  tournament_id: number;
  participant_id: number | null;
  team_id: number | null;
  lane_number: number;
  shift_number: number;
  participant_name?: string;
  team_name?: string;
}

export interface Score {
  id: number;
  tournament_id: number;
  participant_id: number;
  game_number: number;
  score: number;
  participant_name?: string;
}

export interface Standing {
  participant_id: number;
  participant_name: string;
  team_name: string | null;
  total_score: number;
  average_score: number;
  games_played: number;
}

export interface SeedItem {
  seed: number;
  id: number;
  name: string;
  total_score: number;
  kind: 'team' | 'participant';
}

export interface AuthSession {
  token: string;
  id: number;
  username: string;
  role: 'admin' | 'moderator';
}

export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'moderator';
}

export interface UserAccount {
  id: number;
  username: string;
  role: 'admin' | 'moderator';
  active: number;
  created_at: string;
}

export interface TournamentModeratorAccessItem {
  user_id: number;
  username: string;
  active: boolean;
  expires_at: string | null;
  granted_at?: string | null;
}

export interface ModeratorTournamentAccess {
  can_manage: boolean;
  assignments: TournamentModeratorAccessItem[];
  success?: boolean;
}

const api = {
  authHeaders(token?: string): HeadersInit {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  },
  async safeJson(res: Response): Promise<any> {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  },
  async login(username: string, password: string): Promise<AuthSession> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Login failed');
    }
    return data;
  },
  async getMe(token?: string): Promise<AuthUser | null> {
    const res = await fetch('/api/auth/me', {
      headers: this.authHeaders(token),
    });
    if (res.status === 401) return null;
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to read session');
    }
    return data;
  },
  async logout(token?: string): Promise<{ success: boolean }> {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: this.authHeaders(token),
    });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Logout failed');
    }
    return data;
  },
  async getModeratorAccess(tournamentId: number): Promise<ModeratorTournamentAccess> {
    const res = await fetch(`/api/tournaments/${tournamentId}/moderator-access`);
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to load moderator access');
    }
    return data;
  },
  async setModeratorAccess(
    tournamentId: number,
    payload: { moderator_user_id: number; enabled: boolean; expires_in_hours?: number | null }
  ): Promise<ModeratorTournamentAccess> {
    const res = await fetch(`/api/tournaments/${tournamentId}/moderator-access`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to update moderator access');
    }
    return data;
  },
  async removeModeratorAccess(tournamentId: number, userId: number): Promise<{ success: boolean }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/moderator-access/${userId}`, {
      method: 'DELETE',
    });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to remove moderator access');
    }
    return data;
  },
  async getUsers(role?: 'admin' | 'moderator'): Promise<UserAccount[]> {
    const query = role ? `?role=${role}` : '';
    const res = await fetch(`/api/users${query}`);
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to fetch users');
    }
    return data;
  },
  async createUser(payload: { username: string; password: string; role: 'admin' | 'moderator' }): Promise<{ id: number; username: string; role: 'admin' | 'moderator' }> {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to create user');
    }
    return data;
  },
  async changePassword(userId: number, newPassword: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/users/${userId}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPassword }),
    });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to change password');
    }
    return data;
  },
  async getTournaments(): Promise<Tournament[]> {
    const res = await fetch('/api/tournaments');
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to load tournaments');
    }
    return data;
  },
  async createTournament(data: Partial<Tournament>): Promise<{ id: number }> {
    const res = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(body?.error || 'Failed to create tournament');
    }
    return body;
  },
  async getTournament(id: number): Promise<Tournament> {
    const res = await fetch(`/api/tournaments/${id}`);
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to load tournament');
    }
    return data;
  },
  async updateTournament(id: number, data: Partial<Tournament>): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`/api/tournaments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(body?.error || 'Failed to update tournament');
    }
    return body;
  },
  async deleteTournament(id: number): Promise<{ success: boolean }> {
    const res = await fetch(`/api/tournaments/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },
  async getParticipants(tournamentId: number): Promise<Participant[]> {
    const res = await fetch(`/api/tournaments/${tournamentId}/participants`);
    return res.json();
  },
  async addParticipant(tournamentId: number, data: Partial<Participant>): Promise<{ id: number }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to add participant');
    }
    return res.json();
  },
  async updateParticipant(id: number, data: Partial<Participant>): Promise<{ success: boolean }> {
    const res = await fetch(`/api/participants/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to update participant');
    }
    return res.json();
  },
  async updateParticipantTeamOrder(id: number, position: number): Promise<{ success: boolean }> {
    const res = await fetch(`/api/participants/${id}/team-order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to update participant team order');
    }
    return res.json();
  },
  async swapParticipantTeamOrder(id: number, withParticipantId: number): Promise<{ success: boolean }> {
    const res = await fetch(`/api/participants/${id}/team-order/swap`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ with_participant_id: withParticipantId }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to swap participant team order');
    }
    return res.json();
  },
  async deleteParticipant(id: number): Promise<{ success: boolean }> {
    const res = await fetch(`/api/participants/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },
  async clearParticipants(tournamentId: number): Promise<{ success: boolean; deleted: number }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/participants`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to clear participants');
    }
    return res.json();
  },
  async bulkAddParticipants(
    tournamentId: number,
    participants: Partial<Participant>[],
    options?: { replaceExisting?: boolean }
  ): Promise<{ success: boolean }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/participants/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participants,
        replace_existing: options?.replaceExisting === true,
      }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to bulk add participants');
    }
    return res.json();
  },
  async bulkAssignParticipantsToTeams(
    tournamentId: number,
    assignments: Array<{ participant_id: number; team_id: number }>
  ): Promise<{ success: boolean; updated: number }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/participants/team-assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to bulk assign participants to teams');
    }
    return res.json();
  },
  async getTeams(tournamentId: number): Promise<Team[]> {
    const res = await fetch(`/api/tournaments/${tournamentId}/teams`);
    return res.json();
  },
  async addTeam(tournamentId: number, data: Partial<Team>): Promise<{ id: number }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async updateTeam(id: number, data: Partial<Team>): Promise<{ success: boolean }> {
    const res = await fetch(`/api/teams/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async deleteTeam(id: number): Promise<{ success: boolean }> {
    const res = await fetch(`/api/teams/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },
  async bulkAddTeams(
    tournamentId: number,
    teams: Partial<Team>[],
    options?: { replaceExisting?: boolean }
  ): Promise<{ success: boolean }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/teams/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teams,
        replace_existing: options?.replaceExisting === true,
      }),
    });
    return res.json();
  },
  async getLanes(tournamentId: number): Promise<LaneAssignment[]> {
    const res = await fetch(`/api/tournaments/${tournamentId}/lanes`);
    return res.json();
  },
  async addLaneAssignment(tournamentId: number, data: Partial<LaneAssignment>): Promise<{ id: number }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/lanes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async updateLaneAssignment(id: number, data: Partial<LaneAssignment>): Promise<{ success: boolean }> {
    const res = await fetch(`/api/lanes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async swapLaneAssignments(id: number, withLaneAssignmentId: number): Promise<{ success: boolean }> {
    const res = await fetch(`/api/lanes/${id}/swap`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ with_lane_assignment_id: withLaneAssignmentId }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to swap lane assignments');
    }
    return res.json();
  },
  async deleteLaneAssignment(id: number): Promise<{ success: boolean }> {
    const res = await fetch(`/api/lanes/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },
  async bulkUpdateLanes(tournamentId: number, assignments: Partial<LaneAssignment>[]): Promise<{ success: boolean }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/lanes/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments }),
    });
    return res.json();
  },
  async autoAssignLanes(tournamentId: number): Promise<{ success: boolean }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/lanes/auto`, {
      method: 'POST',
    });
    return res.json();
  },
  async getScores(tournamentId: number): Promise<Score[]> {
    const res = await fetch(`/api/tournaments/${tournamentId}/scores`);
    return res.json();
  },
  async addScore(tournamentId: number, data: Partial<Score>): Promise<{ id: number }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async clearScores(tournamentId: number): Promise<{ success: boolean; deleted: number }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/scores`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to clear scores');
    }
    return res.json();
  },
  async clearScoresForParticipants(tournamentId: number, participantIds: number[]): Promise<{ success: boolean; deleted: number }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/scores/participants`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participant_ids: participantIds }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to clear participant scores');
    }
    return res.json();
  },
  async getStandings(tournamentId: number): Promise<Standing[]> {
    const res = await fetch(`/api/tournaments/${tournamentId}/standings`);
    return res.json();
  },
  async getBrackets(tournamentId: number): Promise<any[]> {
    const res = await fetch(`/api/tournaments/${tournamentId}/brackets`);
    return res.json();
  },
  async getSeeds(tournamentId: number, qualifiedCount: number): Promise<{ type: 'team' | 'individual'; qualified_count: number; seeds: SeedItem[] }> {
    const params = new URLSearchParams();
    if (qualifiedCount > 0) {
      params.set('qualified_count', String(qualifiedCount));
    }
    const query = params.toString();
    const res = await fetch(`/api/tournaments/${tournamentId}/seeds${query ? `?${query}` : ''}`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to fetch seeds');
    }
    return res.json();
  },
  async clearBrackets(tournamentId: number): Promise<{ success: boolean; deleted: number }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/brackets`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to clear brackets');
    }
    return res.json();
  },
  async updateBracketSettings(
    tournamentId: number,
    settings: {
      match_play_type: Tournament['match_play_type'];
      qualified_count: number;
      playoff_winners_count: number;
    }
  ): Promise<{ success: boolean; settings?: { match_play_type: Tournament['match_play_type']; qualified_count: number; playoff_winners_count: number } }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/bracket-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const data = await api.safeJson(res);
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update bracket settings');
    }
    return data;
  },
  async generateBrackets(
    tournamentId: number,
    options?: {
      match_play_type?: Tournament['match_play_type'];
      qualified_count?: number;
      playoff_winners_count?: number;
      seed_ids?: number[];
      seed_kind?: 'team' | 'participant';
      team_selection_draft?: {
        seed1_opponent_seed: number;
        seed2_opponent_seed: number;
        seed3_opponent_seed: number;
      };
    }
  ): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/brackets/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to generate brackets');
    }
    return res.json();
  },
  async generateManualBrackets(
    tournamentId: number,
    options: {
      rounds_count: number;
      round1_matches: number;
      winners_mode: '1' | '3';
      links?: Array<{
        from_round: number;
        from_match_index: number;
        outcome: 'winner' | 'loser';
        to_round: number;
        to_match_index: number;
        to_slot: 'p1' | 'p2';
      }>;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/brackets/generate-manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    const data = await api.safeJson(res);
    if (!res.ok) {
      throw new Error(data.error || 'Failed to generate manual brackets');
    }
    return data;
  },
  async assignBracketSeed(
    tournamentId: number,
    matchId: number,
    options: { slot: 'p1' | 'p2'; seed_id: number; seed_kind: 'team' | 'participant'; seed?: number }
  ): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/brackets/${matchId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    const data = await api.safeJson(res);
    if (!res.ok) {
      throw new Error(data.error || 'Failed to assign seed to bracket slot');
    }
    return data;
  },
  async setBracketWinner(tournamentId: number, matchId: number, winnerId: number): Promise<{ success: boolean }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/brackets/${matchId}/winner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winner_id: winnerId }),
    });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to set bracket winner');
    }
    return data;
  },
  async setStepladderShootoutWinner(
    tournamentId: number,
    matchId: number,
    scores: { score_p1: number; score_p2: number; score_p3: number }
  ): Promise<{ success: boolean; winner_id: number }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/brackets/${matchId}/stepladder-shootout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scores),
    });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to resolve stepladder shootout');
    }
    return data;
  },
};

export default api;
