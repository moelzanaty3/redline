// Off-site identity: the repository, the package, the licence, the person.
// Every one of these is a link a technical reader looks for before they trust a
// CLI that writes into their repo, so they live in one place and are imported —
// never inlined at a call site, where a stale URL survives unnoticed.

export const AUTHOR = "Mohamed Elzanaty";
export const LINKEDIN_URL = "https://www.linkedin.com/in/moelzanaty3/";

// Why the attribution is here at all: the credibility is the point. One name in
// a copyright line reads as a side project; the same name stated as the reason
// the tool exists reads as provenance. The role is the claim — it is why the
// rules look the way they do — so it is in the sentence, not in a footnote.
export const AUTHOR_CREDIT =
  "an engineering manager at Vodafone who had this problem at scale";

export const GITHUB_REPO = "moelzanaty3/redline";
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;

export const NPM_PACKAGE = "redlinegate";
export const NPM_URL = `https://www.npmjs.com/package/${NPM_PACKAGE}`;

export const LICENSE_NAME = "MIT";
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;

// What the product is, in terms a reader can check against the diff in front of
// them. Abstract nouns ("oversight layer for AI-assisted development") describe
// a category, not this thing.
export const PRODUCT_BLURB =
  "The review standard for code your team didn't hand-write. One versioned rule set, enforced on the diff — on GitHub and Azure DevOps.";

// The main navigation, shared by the desktop bar and the mobile menu so the two
// can never drift apart.
export type NavLink = { readonly href: string; readonly label: string };

export const NAV_LINKS: readonly NavLink[] = [
  { href: "/docs", label: "Docs" },
  { href: "/docs/standards", label: "Standards" },
  { href: "/docs/adaptors/github-copilot", label: "Adaptors" },
  { href: "/docs/installation", label: "Installation" },
];
