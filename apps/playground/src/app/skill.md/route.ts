import { loadSkill, markdownResponse } from "../../lib/docs-markdown";

export const dynamic = "force-static";

// The agent setup skill, in the Agent Skills format, for agents that fetch it
// directly instead of installing it from the repo.
export const GET = async (): Promise<Response> => markdownResponse(await loadSkill());
