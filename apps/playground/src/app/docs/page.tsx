import { redirect } from "next/navigation";
import { DOCS_DEFAULT_SLUG } from "../../lib/docs-nav";

const DocsIndexPage = () => {
  redirect(`/docs/${DOCS_DEFAULT_SLUG}`);
};

export default DocsIndexPage;
