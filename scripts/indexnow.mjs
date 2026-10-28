// Submits every URL in the inkset.dev sitemap to IndexNow, so Bing, Yandex,
// and the other participating search engines recrawl them.
//
//   node scripts/indexnow.mjs              # submit the live sitemap
//   node scripts/indexnow.mjs --dry-run    # print the request without sending it
//   node scripts/indexnow.mjs --sitemap http://localhost:3000/sitemap.xml
//
// Run it after a deploy. The key is the name of the .txt file in
// apps/playground/public, which IndexNow fetches to verify the host.

import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "inkset.dev";
const ENDPOINT = "https://api.indexnow.org/indexnow";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const sitemapFlag = args.indexOf("--sitemap");
const sitemapUrl = sitemapFlag >= 0 ? args[sitemapFlag + 1] : `https://${HOST}/sitemap.xml`;

const publicDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "apps",
  "playground",
  "public",
);
const keyFile = readdirSync(publicDir).find((name) => /^[0-9a-f]{32}\.txt$/.test(name));
if (!keyFile) {
  console.error(`No IndexNow key file (32 hex characters + .txt) in ${publicDir}`);
  process.exit(1);
}
const key = keyFile.slice(0, -4);

const sitemapResponse = await fetch(sitemapUrl);
if (!sitemapResponse.ok) {
  console.error(`Could not fetch ${sitemapUrl}: ${sitemapResponse.status}`);
  process.exit(1);
}
const sitemap = await sitemapResponse.text();
// IndexNow rejects URLs on other hosts, so keep only inkset.dev URLs.
const urlList = [...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
  .map((match) => match[1])
  .filter((url) => new URL(url).host === HOST);

const body = {
  host: HOST,
  key,
  keyLocation: `https://${HOST}/${keyFile}`,
  urlList,
};

if (dryRun) {
  console.log(`POST ${ENDPOINT}`);
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}

const response = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});
// 200 and 202 both mean IndexNow accepted the URLs.
console.log(`IndexNow: ${response.status} ${response.statusText} (${urlList.length} URLs)`);
if (!response.ok) {
  console.error(await response.text());
  process.exit(1);
}
