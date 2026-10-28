import type { Metadata } from "next";
import { GearDemo } from "./gear-demo";

export const metadata: Metadata = {
  title: "Generative UI",
  description:
    "A model answer that mixes streamed Markdown with an interactive json-render component, rendered by Inkset.",
};

const Page = () => <GearDemo />;

export default Page;
