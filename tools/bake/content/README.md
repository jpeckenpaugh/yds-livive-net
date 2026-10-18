# Content translation tables

One file per content conversation: **`<conversation-id>.es.json`**, a flat
bilingual phrase map.

```jsonc
{
  "Hi Bobby. Do you want to get together tomorrow?": "Hola Bobby. ¿Quieres que nos juntemos mañana?",
  "we get together": "nos juntemos",
}
```

It is used in **both** directions by `tools/bake/content.mjs`:

- **Forward** — the key is the _rendered English line_. The pipeline renders every
  reachable variant of every template before translating it, so each variant needs
  its own entry. The Spanish for a line is therefore authored, never assembled from
  parts, which is what keeps a translated sentence from containing an injected
  English noun.
- **Reverse** — the key is the _Spanish span_. The gloss index is built by
  segmenting the Spanish, so the phrases a learner can hover need entries too.

`npm run bake:content <id>` reports every gap by name:

- `no authored Spanish for this line: <english>` — a missing forward entry.
- `GLOSS-IDENTITY gloss.<span>` — a Spanish span with no English gloss. Under
  `reviewPolicy: 'shipping'` this is an **error**, which is what makes a
  half-glossed conversation impossible to ship. The reported list _is_ the work
  list; add entries and re-run.

## Provenance

These conversations are `reviewPolicy: 'shipping'` with `reviewedBy: 'agent'`.
The Spanish is authored, so the artifact's `l2 === mt` holds by construction, and
nothing claims the owner has adjudicated it. Do not hand-edit a generated
artifact: `sourceHash` will report it stale, and edits to `l2` without
`reviewedBy: 'owner'` are `E_EDITED_NOT_OWNER`.
