export type Heading = { id: string; text: string; level: 2 | 3 };

// One heading is a title, not a table of contents. It lives here rather than in
// the rail because the layout has to know the same answer: the rail's column is
// reserved in CSS, so a page that renders no rail would otherwise hold 248px of
// empty gutter open and squeeze its own content into what is left. The rail is
// a client component, and a server layout cannot call into one.
export const hasToc = (headings: Heading[]): boolean => headings.length >= 2;
