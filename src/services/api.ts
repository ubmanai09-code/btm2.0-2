export interface Tournament {
  id: number;
  name: string;
  date: string;
  location: string;
  format: string;
  organizer: string;
  logo: string;
  match_play_type: 'single_elimination' | 'double_elimination' | 'ladder' | 'stepladder' | 'playoff' | 'team_selection_playoff' | 'survivor_elimination' | 'bowling_hybrid';
  qualified_count: number;
  playoff_winners_count: number;
  known_bracket_format_id?: string | null;
  type: 'individual' | 'team';
  games_count: number;
  genders_rule: string;
  lanes_count: number;
  players_per_lane: number;
  players_per_team: number;
  shifts_count: number;
  oil_pattern: string;
  status: 'draft' | 'active' | 'finished' | 'archived';
  has_additional_scores?: number;
  has_bonus?: number;
  show_player_style?: number;
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

export interface LeagueRankingRow {
  rank: number;
  key: string;
  name: string;
  gender?: 'male' | 'female' | 'unknown';
  club?: string | null;
  total_score: number;
  events_played: number;
  average_event_score: number;
  tournament_names: string[];
}

export interface LeagueRankingResponse {
  league_code: string;
  league_name: string;
  mode: 'players' | 'teams';
  division: 'all' | 'male' | 'female';
  tournaments: Array<{ id: number; name: string; date?: string; type?: Tournament['type'] }>;
  rows: LeagueRankingRow[];
}

export interface StandingBonus {
  id: number;
  tournament_id: number;
  target_kind: 'participant' | 'team';
  target_id: number;
  bonus: number;
}

export interface StandingAdditionalScore {
  id: number;
  tournament_id: number;
  target_kind: 'participant' | 'team';
  target_id: number;
  additional_score: number;
}

export interface ManualWinnerEntry {
  id: number;
  tournament_id: number;
  division: 'all' | 'female' | 'male';
  place: 'first' | 'second' | 'third';
  target_kind: 'participant' | 'team' | 'manual';
  target_id: number | null;
  display_name: string;
}

export interface SeedItem {
  seed: number;
  id: number;
  name: string;
  total_score: number;
  kind: 'team' | 'participant';
}

export interface KnownBracketFormat {
  id: string;
  name: string;
  match_play_type: Tournament['match_play_type'];
  round_match_counts: number[];
  round_rules: Array<'duel' | 'survivor_cut'>;
  placement_rules?: {
    first?: string;
    second?: string;
    third?: string;
  };
  description?: string;
  min_qualified_count?: number;
  recommended_qualified_count?: number;
}

export type KnownBracketFormatInput = {
  id: string;
  name: string;
  match_play_type: Tournament['match_play_type'];
  round_match_counts: number[];
  round_rules: Array<'duel' | 'survivor_cut'>;
  placement_rules?: {
    first?: string;
    second?: string;
    third?: string;
    [key: string]: unknown;
  };
  description?: string;
  min_qualified_count?: number;
  recommended_qualified_count?: number;
};

export interface BuilderRulePreset {
  id: string;
  name: string;
  description?: string;
  seeding_method: 'registration' | 'manual' | 'random';
  rounds: any[];
  bracketCategory?: 'single-elim' | 'stepladder' | 'playoff' | 'ladder' | 'custom' | 'mixed';
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
  async saveSponsorsConfig(config: any): Promise<{ success: boolean }> {
    const res = await fetch('/api/sponsors-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to save sponsors config');
    }
    return data;
  },
  async getSponsorsConfig(): Promise<any> {
    const res = await fetch('/api/sponsors-config', { cache: 'no-store' });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to load sponsors config');
    }
    return data;
  },
  async resetSponsorsConfig(): Promise<{ success: boolean }> {
    const res = await fetch('/api/sponsors-config', {
      method: 'DELETE',
    });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to reset sponsors config');
    }
    return data;
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
  async saveShootoutResults(tournamentId: number, matchId: number, scores: Array<{ participant_id: number; score: number }>): Promise<{ success: boolean }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/brackets/${matchId}/shootout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scores }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || 'Failed to save shootout results');
    }
    return res.json();
  },
  async getStandings(tournamentId: number): Promise<Standing[]> {
    const res = await fetch(`/api/tournaments/${tournamentId}/standings`);
    return res.json();
  },
  async getLeagueRankings(options: {
    league: 'mba' | 'b-bowling';
    mode?: 'players' | 'teams';
    division?: 'all' | 'male' | 'female';
  }): Promise<LeagueRankingResponse> {
    const params = new URLSearchParams();
    params.set('league', options.league);
    if (options.mode) params.set('mode', options.mode);
    if (options.division) params.set('division', options.division);
    const res = await fetch(`/api/league-rankings?${params.toString()}`);
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || `Failed to load league rankings (${res.status})`);
    }
    return data;
  },
  async getStandingsBonuses(tournamentId: number): Promise<StandingBonus[]> {
    const res = await fetch(`/api/tournaments/${tournamentId}/bonuses`);
    if (!res.ok) {
      const error = await this.safeJson(res);
      throw new Error(error?.error || `Failed to load standings bonuses (${res.status})`);
    }
    return res.json();
  },
  async setStandingBonus(
    tournamentId: number,
    payload: { target_kind: 'participant' | 'team'; target_id: number; bonus: number }
  ): Promise<{ success: boolean }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/bonuses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const error = await this.safeJson(res);
      throw new Error(error?.error || `Failed to save bonus (${res.status})`);
    }
    return res.json();
  },
  async getStandingsAdditionalScores(tournamentId: number): Promise<StandingAdditionalScore[]> {
    const res = await fetch(`/api/tournaments/${tournamentId}/additional-scores`);
    if (!res.ok) {
      const error = await this.safeJson(res);
      throw new Error(error?.error || `Failed to load additional scores (${res.status})`);
    }
    return res.json();
  },
  async setStandingAdditionalScore(
    tournamentId: number,
    payload: { target_kind: 'participant' | 'team'; target_id: number; additional_score: number }
  ): Promise<{ success: boolean }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/additional-scores`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const error = await this.safeJson(res);
      throw new Error(error?.error || `Failed to save additional score (${res.status})`);
    }
    return res.json();
  },
  async setTournamentStandingsConfig(
    tournamentId: number,
    config: { has_additional_scores?: number; has_bonus?: number }
  ): Promise<{ success: boolean }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/standings-config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      const error = await this.safeJson(res);
      throw new Error(error?.error || `Failed to update standings config (${res.status})`);
    }
    return res.json();
  },
  async getManualWinners(tournamentId: number): Promise<ManualWinnerEntry[]> {
    const res = await fetch(`/api/tournaments/${tournamentId}/manual-winners`);
    if (!res.ok) {
      const error = await this.safeJson(res);
      throw new Error(error?.error || `Failed to load manual winners (${res.status})`);
    }
    return res.json();
  },
  async setManualWinner(
    tournamentId: number,
    payload: {
      division: 'all' | 'female' | 'male';
      place: 'first' | 'second' | 'third';
      target_kind: 'participant' | 'team' | 'manual';
      target_id?: number | null;
      display_name?: string;
    }
  ): Promise<{ success: boolean; entry?: ManualWinnerEntry }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/manual-winners`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const error = await this.safeJson(res);
      throw new Error(error?.error || `Failed to save manual winner (${res.status})`);
    }
    return res.json();
  },
  async getBrackets(tournamentId: number, options?: { division?: 'all' | 'male' | 'female' }): Promise<any[]> {
    const params = new URLSearchParams();
    if (options?.division && options.division !== 'all') {
      params.set('division', options.division);
    }
    const query = params.toString();
    const res = await fetch(`/api/tournaments/${tournamentId}/brackets${query ? `?${query}` : ''}`);
    return res.json();
  },
  async getSeeds(
    tournamentId: number,
    qualifiedCount: number,
    options?: { gender?: 'male' | 'female' }
  ): Promise<{ type: 'team' | 'individual'; qualified_count: number; seeds: SeedItem[] }> {
    const params = new URLSearchParams();
    if (qualifiedCount > 0) {
      params.set('qualified_count', String(qualifiedCount));
    }
    if (options?.gender) {
      params.set('gender', options.gender);
    }
    const query = params.toString();
    const res = await fetch(`/api/tournaments/${tournamentId}/seeds${query ? `?${query}` : ''}`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to fetch seeds');
    }
    return res.json();
  },
  async clearBrackets(tournamentId: number, options?: { division?: 'all' | 'male' | 'female' }): Promise<{ success: boolean; deleted: number }> {
    const params = new URLSearchParams();
    if (options?.division && options.division !== 'all') {
      params.set('division', options.division);
    }
    const query = params.toString();
    const res = await fetch(`/api/tournaments/${tournamentId}/brackets${query ? `?${query}` : ''}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to clear brackets');
    }
    return res.json();
  },
  async cleanupMalformedBrackets(tournamentId: number): Promise<{ success: boolean; scanned: number; deleted: number }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/brackets/cleanup-malformed`, {
      method: 'POST',
    });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to cleanup malformed bracket rows');
    }
    return data;
  },
  async updateBracketSettings(
    tournamentId: number,
    settings: {
      match_play_type: Tournament['match_play_type'];
      qualified_count: number;
      playoff_winners_count: number;
      known_bracket_format_id?: string | null;
    }
  ): Promise<{ success: boolean; settings?: { match_play_type: Tournament['match_play_type']; qualified_count: number; playoff_winners_count: number; known_bracket_format_id?: string | null } }> {
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
  async getKnownBracketFormats(): Promise<KnownBracketFormat[]> {
    const res = await fetch('/api/bracket-known-formats');
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to load bracket formats');
    }
    return Array.isArray(data?.formats) ? data.formats : [];
  },
  async createKnownBracketFormat(payload: KnownBracketFormatInput): Promise<{ success: boolean; format?: KnownBracketFormat }> {
    const res = await fetch('/api/bracket-known-formats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to create preset');
    }
    return data;
  },
  async updateKnownBracketFormat(id: string, payload: KnownBracketFormatInput): Promise<{ success: boolean; format?: KnownBracketFormat }> {
    const res = await fetch(`/api/bracket-known-formats/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to update preset');
    }
    return data;
  },
  async deleteKnownBracketFormat(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/bracket-known-formats/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to delete preset');
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
      division?: 'all' | 'male' | 'female';
      known_bracket_format_id?: string | null;
      team_selection_draft?: Record<string, number>;
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
      round_match_counts: number[];
      round_rules?: string[];
      placement_rules?: {
        first?: string;
        second?: string;
        third?: string;
      };
      winners_mode: '1' | '3';
      division?: 'all' | 'male' | 'female';
      links?: Array<{
        from_round: number;
        from_match_index: number;
        outcome: 'winner' | 'loser';
        to_round: number;
        to_match_index: number;
        to_slot: 'p1' | 'p2';
      }>;
      engine_matches?: Array<{
        id: string;
        label: string;
        roundId: string;
        roundName: string;
        roundIndex: number;
        roundNumber: number;
        matchIndex: number;
        matchType: string;
        scoringType: string;
        playersPerMatch: number;
        advancementCount: number;
        slots: Array<{
          slotIndex: number;
          sourceType: string;
          sourceLabel: string;
          participantDbId: number | null;
          seed: number | null;
          fromMatchId: string | null;
          advanceRank: number | null;
          outcome?: 'winner' | 'loser';
        }>;
        nextLinks: Array<{
          targetMatchId: string;
          targetSlotIndex: number;
          advanceRank: number;
          outcome?: 'winner' | 'loser';
        }>;
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
    options: { slot: 'p1' | 'p2'; slot_index?: number; seed_id: number; seed_kind: 'team' | 'participant'; seed?: number }
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
  async setBracketDuelScores(
    tournamentId: number,
    matchId: number,
    scores: Array<{ participant_id: number; score: number }>
  ): Promise<{ success: boolean; winner_id: number }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/brackets/${matchId}/duel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scores }),
    });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to submit duel scores');
    }
    return data;
  },
  async setBracketShootoutScores(
    tournamentId: number,
    matchId: number,
    scores: Array<{ participant_id: number; score: number }>
  ): Promise<{ success: boolean }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/brackets/${matchId}/shootout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scores }),
    });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to submit shootout scores');
    }
    return data;
  },
  async resetBracketMatchScores(
    tournamentId: number,
    matchId: number
  ): Promise<{ success: boolean }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/brackets/${matchId}/scores-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await this.safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to reset match scores');
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
  toBuilderPreset(format: KnownBracketFormat): BuilderRulePreset {
    const placementRules = (format.placement_rules || {}) as any;
    const builderState = placementRules.builder || {};
    const savedRounds = Array.isArray(builderState.rounds) ? builderState.rounds : null;
    const fallbackRounds = (format.round_match_counts || []).map((count: number, index: number) => {
      const rule = (format.round_rules || [])[index] || 'duel';
      return {
        id: `round-${index + 1}`,
        name: index === 0 ? 'Round 1' : `Round ${index + 1}`,
        matchType: rule === 'shootout' ? 'shootout' : (rule === 'survivor_cut' ? 'group' : 'head-to-head'),
        sourceOutcome: 'winner',
        playersPerMatch: rule === 'duel' ? 2 : 4,
        scoringType: 'pins',
        bestOf: 1,
        advancementCount: rule === 'duel' ? 1 : 2,
        manualMatchCount: Number.isFinite(Number(count)) ? Math.max(1, Number(count)) : 1,
        reseed: false,
      };
    });
    const cat = builderState?.bracketCategory;
    return {
      id: String(format.id),
      name: String(format.name || 'Preset'),
      description: (format as any).description || '',
      seeding_method: builderState?.seeding_method === 'manual' || builderState?.seeding_method === 'random'
        ? builderState.seeding_method
        : 'registration',
      rounds: savedRounds && savedRounds.length > 0 ? savedRounds : fallbackRounds,
      bracketCategory: (cat === 'single-elim' || cat === 'stepladder' || cat === 'playoff' || cat === 'ladder' || cat === 'custom' || cat === 'mixed') ? cat : undefined,
    };
  },
  toBuilderFormatPayload(payload: {
    id: string;
    name: string;
    description?: string;
    seeding_method: 'registration' | 'manual' | 'random';
    rounds: any[];
    bracketCategory?: 'single-elim' | 'stepladder' | 'playoff' | 'ladder' | 'custom' | 'mixed';
  }): KnownBracketFormatInput {
    const rounds = Array.isArray(payload.rounds) ? payload.rounds : [];
    const round_match_counts = rounds.map((round: any) => {
      const parsed = Number.parseInt(String(round?.manualMatchCount ?? ''), 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    });
    const round_rules: Array<'duel' | 'survivor_cut'> = rounds.map((round: any) => {
      const matchType = String(round?.matchType || '').trim();
      if (matchType === 'shootout') return 'duel';
      if (matchType === 'group') return 'survivor_cut';
      return 'duel';
    });
    return {
      id: payload.id,
      name: payload.name,
      match_play_type: 'playoff',
      round_match_counts,
      round_rules,
      placement_rules: {
        first: '',
        second: '',
        third: '',
        builder: {
          seeding_method: payload.seeding_method,
          bracketCategory: payload.bracketCategory,
          rounds,
        } as any,
      },
      description: payload.description,
    };
  },
  createBuilderPresetId(name: string): string {
    const slug = String(name || 'preset')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'preset';
    return `builder-${slug}-${Date.now()}`;
  },
  async getBuilderRulePresets(): Promise<BuilderRulePreset[]> {
    const formats = await this.getKnownBracketFormats();
    return (formats || []).map((format: KnownBracketFormat) => this.toBuilderPreset(format));
  },
  async createBuilderRulePreset(payload: {
    name: string;
    description?: string;
    seeding_method: 'registration' | 'manual' | 'random';
    rounds: any[];
    bracketCategory?: 'single-elim' | 'stepladder' | 'playoff' | 'ladder' | 'custom' | 'mixed';
  }): Promise<{ success: boolean; preset?: BuilderRulePreset }> {
    const id = this.createBuilderPresetId(payload.name);
    const formatPayload = this.toBuilderFormatPayload({
      id,
      name: String(payload.name || '').trim() || 'Preset',
      description: payload.description,
      seeding_method: payload.seeding_method,
      rounds: payload.rounds,
      bracketCategory: payload.bracketCategory,
    });
    const result = await this.createKnownBracketFormat(formatPayload);
    return {
      success: Boolean(result?.success),
      preset: result?.format ? this.toBuilderPreset(result.format) : undefined,
    };
  },
  async deleteBuilderRulePreset(id: string | number): Promise<{ success: boolean }> {
    return this.deleteKnownBracketFormat(String(id));
  },
  async updateBuilderRulePreset(id: string | number, payload: { name?: string; bracketCategory?: string; rounds?: any[] }): Promise<{ success: boolean; preset?: BuilderRulePreset }> {
    const existing = (await this.getBuilderRulePresets()).find(p => String(p.id) === String(id));
    if (!existing) throw new Error('Preset not found');
    const formatPayload = this.toBuilderFormatPayload({
      id: String(id),
      name: (payload.name ?? '').trim() || existing.name,
      seeding_method: existing.seeding_method,
      rounds: payload.rounds ?? existing.rounds,
      bracketCategory: (payload.bracketCategory as any) || existing.bracketCategory,
    });
    const result = await this.updateKnownBracketFormat(String(id), formatPayload);
    return {
      success: Boolean(result?.success),
      preset: result?.format ? this.toBuilderPreset(result.format) : undefined,
    };
  },

  // ── Bracket V2 saved configs ──────────────────────────────────────────────

  async getBracketV2Configs(tournamentId: number): Promise<any[]> {
    const res = await fetch(`/api/tournaments/${tournamentId}/bracket-v2-configs`);
    const data = await this.safeJson(res);
    if (!res.ok) throw new Error(data?.error || 'Failed to load bracket configs');
    return data;
  },

  async saveBracketV2Config(tournamentId: number, config: any): Promise<{ success: boolean; id: string }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/bracket-v2-configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await this.safeJson(res);
    if (!res.ok) throw new Error(data?.error || 'Failed to save bracket config');
    return data;
  },

  async deleteBracketV2Config(tournamentId: number, configId: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/tournaments/${tournamentId}/bracket-v2-configs/${encodeURIComponent(configId)}`, {
      method: 'DELETE',
    });
    const data = await this.safeJson(res);
    if (!res.ok) throw new Error(data?.error || 'Failed to delete bracket config');
    return data;
  },
};

export default api;
