import { loadScenarios } from "../lib/scenarios";
import { PlaygroundClient } from "./playground-client";

const Page = async () => {
  const scenarios = await loadScenarios();
  return <PlaygroundClient scenarios={scenarios} />;
};

export default Page;
