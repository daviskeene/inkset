const REPO_API = "https://api.github.com/repos/daviskeene/inkset";

/**
 * The repository's star count, refetched at most once an hour. Returns null
 * when GitHub can't be reached (for example, during a networkless build), so
 * the GitHub links render without a count.
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
    return typeof stars === "number" ? stars : null;
  } catch {
    return null;
  }
};
