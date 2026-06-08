const API = 'https://klux-api.michaelwdorrill.workers.dev';

export interface LeaderboardEntry {
  name:  string;
  score: number;
  wave:  number;
}

export async function postScore(
  mode:  'classic' | 'endless',
  name:  string,
  score: number,
  wave:  number,
): Promise<void> {
  await fetch(`${API}/scores?mode=${mode}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name, score, wave }),
  });
}

export async function getTopScores(
  mode:  'classic' | 'endless',
  limit = 10,
): Promise<LeaderboardEntry[]> {
  try {
    const r = await fetch(`${API}/scores/top?mode=${mode}&limit=${limit}`);
    if (!r.ok) return [];
    return r.json();
  } catch {
    return [];
  }
}
