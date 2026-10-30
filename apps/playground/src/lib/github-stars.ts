const REPO_API = "https://api.github.com/repos/daviskeene/inkset";

// The links show a count only above this many stars.
const SHOW_STARS_ABOVE = 100;

/**
 * The repository's star count, refetched at most once an hour. Returns null
 * when GitHub can't be reached (for example, during a networkless build) or
 * when the count is at or below SHOW_STARS_ABOVE, so the GitHub links render
 * without a count.
 */
export const getGithubStars = async (): Promise<number | null> => {
  try {
    const response = await fetch(REPO_API, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const { stargazers_count: stars } = (await response.json()) as { stargazers_count?: unknown };
    return typeof stars === "number" && stars > SHOW_STARS_ABOVE ? stars : null;
  } catch {
    return null;
  }
};
