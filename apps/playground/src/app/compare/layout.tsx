import type { Metadata } from "next";
import type { ReactNode } from "react";

const TITLE = "Inkset vs react-markdown vs Streamdown: streaming Markdown in React";
const DESCRIPTION =
  "Compare Inkset, react-markdown, and Streamdown side by side as they render the same streaming Markdown in React.";

export const metadata: Metadata = {
  // `absolute` skips the "— Inkset" template, which would repeat the name.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/compare" },
  openGraph: {
    type: "website",
    url: "https://inkset.dev/compare",
    siteName: "Inkset",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const CompareLayout = ({ children }: { children: ReactNode }) => children;

export default CompareLayout;
