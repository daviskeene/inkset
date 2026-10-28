import type { Metadata } from "next";
import { FlowBaseline } from "./flow-baseline";

export const metadata: Metadata = {
  title: "Surface flow baseline",
  robots: { index: false, follow: false },
};

type PageProps = { searchParams: Promise<{ mode?: string }> };

const Page = async ({ searchParams }: PageProps) => {
  const { mode } = await searchParams;
  return <FlowBaseline mode={mode === "parts" ? "parts" : "baseline"} />;
};

export default Page;
