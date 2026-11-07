import { pageText, ruleHits, type SearchIndex } from "@/lib/search-index";

// One static file, fetched by the ⌘K palette the first time it opens. Passing
// the index as props from the root layout serialised it into every page's HTML
// and every RSC payload — ~420KB per page, four copies each, on ~700 pages.
export const dynamic = "force-static";

export function GET() {
  const index: SearchIndex = { rules: ruleHits(), body: pageText() };
  return Response.json(index);
}
