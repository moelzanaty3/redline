import { pageText, ruleHits, type SearchIndex } from "@/lib/search-index";

export const dynamic = "force-static";

export function GET() {
  const index: SearchIndex = { rules: ruleHits(), body: pageText() };
  return Response.json(index);
}
