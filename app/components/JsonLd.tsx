// Renders one JSON-LD <script> tag. Escapes "<" so a string field (e.g. a concept
// summary) can never prematurely close the script tag or open a new one.
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
