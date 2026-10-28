import type { Metadata } from "next";
import { GearDemo } from "./gear-demo";

const TITLE = "Generative UI";
const DESCRIPTION =
  "A model answer that mixes streamed Markdown with an interactive json-render component, rendered by Inkset.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/generative-ui" },
  openGraph: {
    type: "website",
    url: "https://inkset.dev/generative-ui",
    siteName: "Inkset",
    title: `${TITLE} — Inkset`,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: `${TITLE} — Inkset`, description: DESCRIPTION },
};

const Page = () => <GearDemo />;

export default Page;
