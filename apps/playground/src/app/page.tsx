import type { Metadata } from "next";
import { loadScenarios } from "../lib/scenarios";
import { SITE_SUMMARY, SITE_URL } from "../lib/docs-markdown";
import { JsonLd } from "../components/json-ld";
import { PlaygroundClient } from "./playground-client";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const AUTHOR = { "@type": "Person", name: "Davis Keene", url: "https://daviskeene.com" };

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Inkset",
      url: SITE_URL,
      description: SITE_SUMMARY,
      inLanguage: "en",
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": `${SITE_URL}/#source`,
      name: "Inkset",
      description: SITE_SUMMARY,
      url: SITE_URL,
      codeRepository: "https://github.com/daviskeene/inkset",
      programmingLanguage: "TypeScript",
      runtimePlatform: "React",
      license: "https://opensource.org/licenses/MIT",
      author: AUTHOR,
      targetProduct: { "@id": `${SITE_URL}/#software` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: "Inkset",
      description: SITE_SUMMARY,
      url: SITE_URL,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any",
      softwareRequirements: "React 18 or 19",
      installUrl: "https://www.npmjs.com/package/@inkset/react",
      license: "https://opensource.org/licenses/MIT",
      author: AUTHOR,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ],
};

const Page = async () => {
  const scenarios = await loadScenarios();
  return (
    <>
      <JsonLd data={STRUCTURED_DATA} />
      <PlaygroundClient scenarios={scenarios} />
    </>
  );
};

export default Page;
