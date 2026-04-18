import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Compare: Inkset vs Streamdown",
  description:
    "Side-by-side benchmark of Inkset and Streamdown rendering the same streaming markdown in React — frame stability, layout shift, and time-to-paint.",
  alternates: { canonical: "/compare" },
  openGraph: {
    type: "website",
    url: "https://inkset.dev/compare",
    title: "Compare: Inkset vs Streamdown",
    description:
      "Side-by-side benchmark of Inkset and Streamdown rendering the same streaming markdown in React.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Compare: Inkset vs Streamdown",
    description:
      "Side-by-side benchmark of Inkset and Streamdown rendering the same streaming markdown in React.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const CompareLayout = ({ children }: { children: ReactNode }) => children;

export default CompareLayout;
