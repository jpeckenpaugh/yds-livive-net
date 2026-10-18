/**
 * You Don't Say — domain contracts (frozen file #1 of 2)
 * =============================================================================
 *
 * ✅ FROZEN — 2026-10-18. Owner-approved; see `docs/design/README.md`'s status
 * table. After this point, a change to this file is a change to a contract and
 * must be accompanied by an edit to D2.
 *
 * Owned by: docs/design/D2-domain-model.md
 * Engine ports live in `src/engines/ports.ts` (owned by D3). This file must not
 * import from there.
 *
 * Contents
 *   1. Primitives
 *   2. Authored source schema (template-bearing; app code may NOT import it)
 *   3. Generated runtime artifact (slot-free)
 *   4. Segmentation
 *   5. Preferences and visibility
 *   6. Session and operations
 *   7. Resolution
 *   8. Diagnostics
 *   9. Contracts the Engineer implements (function signatures)
 *  10. Canonical constants and frozen tables
 */

/* ============================================================================
 * 1. Primitives
 * ==========================================================================*/

/** BCP-47 language tag. M1 ships only `l1: 'en'` / `l2: 'es'`. */
export type Lang = string;

export type BeatId = string;
export type LineId = string;
export type ChoiceSetId = string;
export type CharacterId = string;
export type VarName = string;
export type ValueKey = string;
export type ChoiceKey = string;

/** Supertonic preset ids. One identity per character in every language. */
export type VoiceId =
  | 'M1' | 'M2' | 'M3' | 'M4' | 'M5'
  | 'F1' | 'F2' | 'F3' | 'F4' | 'F5';

/** The three text channels. Hint and gloss are never translated. */
export type Channel = 'l1' | 'l2' | 'both' | 'none';

/**
 * Per-character, per-language voice override (D2 §12, relocated out of the
 * conversation by locked decision 2 + PM ruling Q13).
 *
 * Named and exported because `src/engines/ports.ts` takes this exact type as an
 * adapter input: an adapter must receive the map rather than read a global, and
 * `resolveVoice` needs a `characterId` to look one up.
 */
export type VoiceOverrides = Partial<Record<CharacterId, Partial<Record<Lang, string>>>>;

/**
 * Who signed off on a generated line or gloss.
 *  - 'owner': a human adjudicated THIS entry (see D6's triage workflow).
 *  - 'agent': a review agent triaged it and did not flag it.
 *  - null:    unreviewed. CI fails on this in a release build.
 * This distinction exists so it is always answerable which text a human read.
 */
export type Reviewer = 'owner' | 'agent' | null;

/**
 * Whether the review gate applies in full.
 *  - 'shipping': yes.
 *  - 'fixture' : M1's content. `E_UNREVIEWED` and `E_EDITED_NOT_OWNER` are
 *                downgraded to warnings, because no triage agent has run and
 *                no human has read it. The report prints the policy, and a
 *                fixture record may never carry `reviewedBy: 'owner'` — that
 *                would assert a human review that never happened (F2).
 */
export type ReviewPolicy = 'shipping' | 'fixture';

/* ============================================================================
 * 2. Authored source schema  (`<id>.source.json`) — template-bearing
 *
 * App code may not import a source file: there is no code path from the
 * browser to a `{slot}`. Enforced by file location plus a D5 lint rule.
 * ==========================================================================*/

export type VariableValue = {
  key: ValueKey;
  /**
   * Surface form substituted into ENGLISH templates before translation,
   * e.g. `movie-plan` -> "a new movie".
   * Required iff some template reads this variable (else E_MISSING_SURFACE_FORM).
   * Unused for a pure selector variable such as `activity`.
   */
  l1?: string;
};

export type Variable = {
  name: VarName;
  values: VariableValue[];
};

export type Character = {
  name: string;
  /** One identity per character across all languages (locked decision 2). */
  voice: VoiceId;
};

/** AND of exact matches. `{}` is forbidden — omit for a fallback. */
export type When = Record<VarName, ValueKey>;

export type Line = {
  id: LineId;
  when?: When;
  /** English. `{varName}` is the only construct; `{`, `}` and `$` are reserved. */
  template: string;
};

export type Option = {
  /** Unique within the beat, across ALL of that beat's choice sets. */
  key: ChoiceKey;
  /** Authored UI chrome in both languages. Literal: slots are forbidden. Never MT'd. */
  label: { l1: string; l2: string };
  /**
   * Decorative, language-independent, literal. Label-class: no slots
   * (`E_LABEL_SLOT`), never MT'd, never reviewed, no glossary entry, and the
   * label text must stand alone without it. Lives here rather than inside
   * `label` because it is not a per-language rendering (D2 §4.3).
   */
  icon?: string;
  /** The spoken response line, English, may read slots (including its own `sets`). */
  template: string;
  /** May be `{}` for a purely rhetorical option. Values are keys, never null. */
  sets: Record<VarName, ValueKey>;
  /*
   * No `hint` here, deliberately (D2 §4.3, amendment C6): a source field with
   * no counterpart on `BuiltOption` and no governing AC is dead. A beat-level
   * `hint` orients the listener to the beat; an option that seems to need its
   * own hint is a signal that its `label` is doing too little work.
   */
};

export type ChoiceSet = {
  id: ChoiceSetId;
  when?: When;
  /** MIN_OPTIONS..MAX_OPTIONS */
  options: Option[];
};

export type SourceBeat = {
  id: BeatId;
  speaker: CharacterId;
  /** Authored L1 only. Slots are forbidden. Never translated. */
  hint?: string;
  /** Fixed beat: >=1 alternative, selected by `when`. */
  line?: Line[];
  /** Choice beat: >=1 set, selected by `when`. */
  choiceSets?: ChoiceSet[];
  /* Exactly one of `line` / `choiceSets` (E_BEAT_ARITY). */
};

export type ConversationSource = {
  id: string;
  title: string;
  l1: Lang;
  l2: Lang;
  characters: Record<CharacterId, Character>;
  variables: Variable[];
  /** Array order IS the timeline order. */
  beats: SourceBeat[];
};

/* ============================================================================
 * 3. Generated runtime artifact  (`<id>.json`) — slot-free
 * ==========================================================================*/

/**
 * A fully-formed render of one alternative's text for one point in the
 * assignment space. The unit of MT, of review, and of provenance.
 *
 * `edited` is DERIVED, never stored:  edited(r) = r.l2 !== r.mt
 */
export type VariantRecord = {
  beatId: BeatId;
  alternativeId: LineId | ChoiceSetId;
  /** Present iff this variant is an option's response line. */
  optionKey?: ChoiceKey;
  /** `variantKey(beatId, parentId, slotNames, assignment)` — see D2 §5.3. */
  variantKey: string;
  /** Rendered English. Complete, slot-free. */
  l1: string;
  /** Spanish. Complete, slot-free. The ONLY human-editable field. */
  l2: string;
  /** Last machine translation of `l1`. Written once; never rewritten by an edit. */
  mt: string;
  /** `sha256:v1:<hex>` of `l1`. Staleness when an authored English line changes. */
  sourceHash: string;
  /** 'owner' is required whenever `l2 !== mt` (E_EDITED_NOT_OWNER). */
  reviewedBy: Reviewer;
  /** Pinned revision id that produced `mt`: a model revision, or an authored-table revision named `authored-<n>` (D2 §7.2). Null in `--author-only` mode. */
  translationRev: string | null;
  /** Id of the review-agent flag that escalated this entry, if any. */
  triageRef?: string;
};

export type GlossEntry = {
  /** The English rendering of the span. */
  l1: string;
  /** 'authored' = an override from `glossary.es.json`, which is human-owned. */
  origin: 'mt' | 'authored';
  /** Last machine rendering. For `origin: 'mt'`, `l1` must equal `mt`. */
  mt: string;
  reviewedBy: Reviewer;
  triageRef?: string;
};

/** Keyed by `normalizeSpan(spanText)` — flat, deduped across variants (see D2 §9.3). */
export type GlossIndex = Record<string, GlossEntry>;

export type BuiltOption = {
  key: ChoiceKey;
  label: { l1: string; l2: string };
  /** Copied verbatim from the source. Decorative; D4 owns the render rule. */
  icon?: string;
  sets: Record<VarName, ValueKey>;
  /** FROZEN read scope, INCLUDING variables this option sets itself. */
  slotNames: VarName[];
};

export type BuiltAlternative = {
  id: LineId | ChoiceSetId;
  when?: When;
  /** FROZEN read scope, derived at build time. The runtime never parses a template. */
  slotNames: VarName[];
  /** Choice beats only. Labels live on options. */
  options?: BuiltOption[];
};

export type BuiltBeat = {
  id: BeatId;
  /** Position in the timeline, 0-based. */
  index: number;
  speaker: CharacterId;
  kind: 'line' | 'choice';
  hint?: string;
  /** Source order preserved: fallback, if any, is last. */
  alternatives: BuiltAlternative[];
};

export type ConversationMeta = {
  schemaVersion: number;
  segmentationVersion: number;
  generatedFrom: string;
  /** Digest of the whole source file, for `bake:check`'s fast path. */
  sourceDigest: string;
  /**
   * 'shipping' — the review gate applies in full.
   * 'fixture'  — M1's content. The review gate is downgraded to warnings because
   *              no triage agent has run, and the report says so. Fixture
   *              records still carry a non-null `reviewedBy` and `l2 === mt`
   *              (D6 §7.2, F2): the field records that this is unreviewed
   *              fixture content rather than pretending otherwise.
   */
  reviewPolicy: ReviewPolicy;
  /** Pinned revisions, or null in `--author-only` mode. */
  translator: { en2romance: string | null; romance2en: string | null };
};

export type Conversation = {
  id: string;
  title: string;
  l1: Lang;
  l2: Lang;
  characters: Record<CharacterId, Character>;
  /** Explicit timeline order. */
  order: BeatId[];
  beats: Record<BeatId, BuiltBeat>;
  /** Keyed globally by variant key (every key is beat-prefixed). */
  lines: Record<string, VariantRecord>;
  gloss: GlossIndex;
  meta: ConversationMeta;
};

/* ============================================================================
 * 4. Segmentation  (one shared module: bake and the browser call THIS)
 * ==========================================================================*/

export type SegmentLevel = 'line' | 'sentence' | 'clause' | 'predicate';

export type Span = {
  level: SegmentLevel;
  /** UTF-16 offsets into the exact `text` passed to `segmentL2`. */
  start: number;
  end: number;
  text: string;
  /** `normalizeSpan(text)` — the gloss index key. */
  key: string;
};

/* ============================================================================
 * 5. Preferences and visibility
 * ==========================================================================*/

export type Preferences = {
  read: Channel;
  hear: Channel;
  hint: boolean;
  /** DEFAULT_SPEED .. clamp range owned by D4. */
  speed: number;
  /** Q13: approximate M1 voice mapping, user-editable per character per language. */
  voiceOverrides: VoiceOverrides;
  /** G1 escape hatch: play L2 with a mismatched default voice when no L2 voice exists. */
  playAnyway: boolean;
};

export type Visibility = {
  showL1: boolean;
  showL2: boolean;
  showHint: boolean;
  /** Length 0..2. `['es','en']` when `hear === 'both'` — L2 first (Q8). */
  playOrder: Lang[];
};

/* ============================================================================
 * 6. Session and operations
 * ==========================================================================*/

export type Session = {
  /** The beat presented as "now". */
  cursor: BeatId;
  /** Furthest beat whose content is visible. Never beyond the first `pending` beat. */
  revealed: BeatId;
  /** Committed picks only. Never contains an invalidated choice. */
  choices: Record<BeatId, ChoiceKey>;
};

export type SessionOp =
  | { type: 'choose'; beatId: BeatId; key: ChoiceKey }
  | { type: 'advance' }
  | { type: 'rewind' }
  | { type: 'reset' };

/* ============================================================================
 * 7. Resolution
 * ==========================================================================*/

export type BeatStatus = 'resolved' | 'pending' | 'unreached';

export type ResolvedLine = {
  alternativeId: LineId | ChoiceSetId;
  variantKey: string;
  l1: string;
  l2: string;
  hint?: string;
};

export type ResolvedOption = {
  key: ChoiceKey;
  label: { l1: string; l2: string };
  /** Resolved with THIS option's own `sets` applied, so a ghost shows what would have been said. */
  line: ResolvedLine;
  sets: Record<VarName, ValueKey>;
  chosen: boolean;
  /** In the matched set but not chosen. Derived, never stored. */
  ghost: boolean;
  /** Q7: every option may be heard before committing. D4 owns the affordance. */
  previewable: true;
};

export type ResolvedBeat = {
  beatId: BeatId;
  index: number;
  speaker: CharacterId;
  kind: 'line' | 'choice';
  status: BeatStatus;
  hint?: string;
  /** kind 'line' and status 'resolved'. */
  line?: ResolvedLine;
  /** kind 'choice'. */
  options?: ResolvedOption[];
  chosenKey?: ChoiceKey;
  /** True only under `autoPick`. Badge these "auto-picked". */
  autoPicked?: boolean;
};

export type ResolveOptions = { autoPick?: boolean };

/**
 * One step of the single timeline walk. `resolveTimeline`, `deriveVariables`
 * and `reachableVariants` are three projections of THIS algorithm; there is no
 * second implementation of the timeline (AC-DOM-14).
 *
 * The walk emits **one step for every beat**, including `unreached` ones. That
 * is what makes "one walk, no padding" true: `resolveTimeline` looks up text
 * where a status says it exists, and never synthesises a step for a beat the
 * walk did not visit (amendment C3). A walk that stopped early would force
 * `resolveTimeline` to pad, which is a second implementation of the timeline.
 */
export type WalkStep = {
  beatId: BeatId;
  /**
   * 'resolved' — the beat's content is determined.
   * 'pending'  — a reachable choice beat with no committed choice and no autoPick.
   * 'unreached'— after the first 'pending'. Undetermined; nothing is rendered.
   */
  status: BeatStatus;
  /** Absent iff `status === 'unreached'`. */
  alternativeId?: LineId | ChoiceSetId;
  /** Variables written so far, before this beat. Empty for an unreached step. */
  assignment: Record<VarName, ValueKey>;
  chosenKey?: ChoiceKey;
  autoPicked?: boolean;
};

/* ============================================================================
 * 8. Diagnostics
 * ==========================================================================*/

export type Severity = 'error' | 'warn' | 'dev';

export type DiagnosticCode =
  // structure
  | 'E_SCHEMA'
  | 'E_SCHEMA_VERSION'
  | 'E_DUPLICATE_BEAT_ID' | 'E_DUPLICATE_LINE_ID' | 'E_DUPLICATE_CHOICE_SET_ID'
  | 'E_DUPLICATE_CHOICE_KEY' | 'E_DUPLICATE_VAR' | 'E_DUPLICATE_VALUE_KEY'
  | 'E_BEAT_ARITY'
  // templates and literals
  | 'E_TEMPLATE_RESERVED_CHAR' | 'E_UNKNOWN_SLOT'
  | 'E_UNKNOWN_VAR' | 'E_UNKNOWN_VALUE'
  | 'E_NULL_WRITE' | 'E_EMPTY_WHEN'
  | 'E_LABEL_SLOT' | 'E_HINT_SLOT'
  | 'E_LABEL_MISSING_LANG' | 'E_MISSING_SURFACE_FORM'
  | 'E_CHOICE_OPTIONS_MIN' | 'E_CHOICE_OPTIONS_MAX'
  // when discipline
  | 'E_NO_MATCH' | 'E_AMBIGUOUS_MATCH'
  | 'E_MULTIPLE_FALLBACK' | 'E_FALLBACK_NOT_LAST'
  | 'E_DEAD_ALTERNATIVE'
  // variable discipline
  | 'E_DEAD_VARIABLE' | 'E_READ_UNSET'
  | 'E_BOUND_PAIR_SLOPPY' | 'E_BOUND_PAIR_AMBIGUOUS'
  // enumeration limits
  | 'E_ENUM_LIMIT_VARIANTS' | 'E_ENUM_LIMIT_ASSIGNMENTS'
  // generated artifact and gloss
  | 'E_VARIANT_KEY_COLLISION'
  | 'E_VARIANT_MISSING' | 'E_ORPHAN_VARIANT'
  | 'E_UNREVIEWED' | 'E_EDITED_NOT_OWNER' | 'E_GLOSS_EDITED_NOT_OWNER'
  | 'E_SOURCE_STALE' | 'E_TRANSLATOR_REV_STALE'
  | 'E_GLOSS_MISSING' | 'E_ORPHAN_GLOSS'
  | 'E_L2_RESERVED_CHAR'
  // session (dev only)
  | 'E_CHOOSE_INVALID_KEY' | 'E_CHOOSE_NOT_CHOICE_BEAT'
  | 'E_ADVANCE_UNRESOLVED' | 'E_ADVANCE_AT_END' | 'E_REWIND_AT_START'
  | 'E_STALE_CHOICE';

export type Diagnostic = {
  code: DiagnosticCode;
  severity: Severity;
  /** JSON pointer-ish locator into the source or generated artifact. */
  path: string;
  message: string;
};

/**
 * Canonical variant key. Composition (D2 §5.3, amended):
 *
 *   [ beatId, parentId, ...slotNames.sort().map(n => `${n}=${assignment[n]}`) ].join('|')
 *
 * `parentId` is `Line.id` for a fixed-beat alternative and `Option.key` for an
 * option. It is REQUIRED for every alternative: it is what makes the key
 * injective when an option's read scope is empty, which it otherwise is not.
 * `sort()` is the default lexicographic sort with NO comparator, and build and
 * runtime must use the identical call (AC-DOM-09).
 */
export type VariantKeyOf = (beatId: BeatId, parentId: LineId | ChoiceKey, slotNames: readonly VarName[], assignment: Record<VarName, ValueKey>) => string;

/* ============================================================================
 * 9. Contracts the Engineer implements
 *
 * Signatures are frozen; bodies are not specified here. Purity is part of the
 * contract (AC-DOM-02): no DOM, fetch, Date, Math.random, or module-level
 * mutable state. Every one of these is callable in plain Node.
 * ==========================================================================*/

/* ---- the walk ------------------------------------------------------------------ */
export type Walk = (
  c: Conversation,
  choices: Record<BeatId, ChoiceKey>,
  opts?: ResolveOptions,
) => WalkStep[];

export type ReachableVariants = (c: Conversation) => WalkStep[];

/* ---- resolution ---------------------------------------------------------------- */
export type ResolveTimeline = (c: Conversation, s: Session, o?: ResolveOptions) => ResolvedBeat[];
export type DeriveVariables = (c: Conversation, s: Session) => Record<VarName, ValueKey>;

/**
 * The initial session (D2 §10, amendment C4):
 *
 *   { cursor: order[0],
 *     revealed: firstPendingBeat ?? order[order.length - 1],
 *     choices: {} }
 *
 * `revealed` is the first beat that still needs a choice, so the transcript
 * shows everything up to and including it and nothing unresolvable. At the
 * initial session that is the first choice beat.
 */
export type InitialSession = (c: Conversation) => Session;

/**
 * Pure and total. For a rejected op it returns the session **unchanged** — it
 * does not throw, and it does not log (AC-DOM-02 forbids logging). Rejection is
 * observable only through `ReduceChecked`.
 */
export type Reduce = (c: Conversation, s: Session, op: SessionOp) => Session;

/**
 * Dev/CI only — lives in `src/domain/validate.ts`, which the app scan root
 * excludes, so it is never in the production bundle. Shares one implementation
 * with `Reduce` and returns the six dev diagnostics of D2 §10:
 * `E_CHOOSE_INVALID_KEY`, `E_CHOOSE_NOT_CHOICE_BEAT`, `E_ADVANCE_UNRESOLVED`,
 * `E_ADVANCE_AT_END`, `E_REWIND_AT_START`. `ValidateSession` covers
 * `E_STALE_CHOICE` only (amendment C2).
 */
export type ReduceChecked = (
  c: Conversation,
  s: Session,
  op: SessionOp,
) => { session: Session; diagnostics: Diagnostic[] };

export type ValidateSession = (c: Conversation, s: Session) => Diagnostic[];
export type MatchChoiceSet = (c: Conversation, beatId: BeatId, assignment: Record<VarName, ValueKey>) => BuiltAlternative | null;
export type IsEdited = (r: VariantRecord) => boolean; // r.l2 !== r.mt

/* ---- presentation semantics ---------------------------------------------------- */

/**
 * A function of `Preferences` alone (D2 §12, amendment C5). No beat parameter:
 * the derivation reads no beat, AC-DOM-19 asserts all 32 inputs without one,
 * and `noUnusedParameters` would reject a parameter that is never used. The two
 * carve-outs that *feel* beat-dependent (option labels always render in at least
 * L1; a textless beat still occupies a row) are presentation rules owned by
 * D4 §5.3, not part of this derivation.
 */
export type VisibilityOf = (p: Preferences) => Visibility;

/* ---- segmentation -------------------------------------------------------------- */
/**
 * All levels for a language that has tables; `line` and `sentence` only for any
 * other language (D2 §9.1, amendment C7). `clause` and `predicate` are defined
 * by Spanish word tables, so they are not returned for another language — an
 * empty set rather than a wrong split. The speech adapter relies on this when it
 * splits a long English line at sentence boundaries.
 */
export type SegmentL2 = (text: string, lang: Lang) => Span[];
export type NormalizeSpan = (text: string) => string;
export type ResolveGlossSpan = (spans: readonly Span[], offset: number) => Span | undefined;
export type LookupGloss = (g: GlossIndex, span: Span) => GlossEntry | undefined;

/* ---- validation (build, CI and dev-assert only; never in the prod bundle) ------- */
export type ValidateConversationSource = (src: ConversationSource) => Diagnostic[];
export type ValidateConversation = (c: Conversation) => Diagnostic[];
export type ReachableAssignments = (c: Conversation) => Array<Record<VarName, ValueKey>>;

/* ============================================================================
 * 10. Canonical constants and frozen tables
 *
 * Semantic constants live here and ONLY here (D2 §13). Asset/model numbers are
 * D3's, timing is D4's, the 10-beat content spec and its counts are D6's.
 * ==========================================================================*/

export const SCHEMA_VERSION = 1;
export const SEGMENTATION_VERSION = 1;
export const SOURCE_HASH_PREFIX = 'sha256:v1:';

export const MAX_VARIANTS_PER_BEAT = 32;
export const MAX_ASSIGNMENTS = 4096;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 8;
export const DEFAULT_SPEED = 1.0;

export const SEGMENT_LEVELS: readonly SegmentLevel[] = ['line', 'sentence', 'clause', 'predicate'];

/** Split BEFORE these tokens (D2 §9.2). */
export const CONNECTOR_SPLIT: readonly string[] = [
  'que', 'si', 'cuando', 'porque', 'aunque', 'mientras', 'como', 'donde',
  'pero', 'sino', 'y', 'o', 'pues',
];

/**
 * Multi-word units that are never split across. `por qué no` lives here so the
 * README's own example survives clause splitting.
 */
export const PROTECTED_UNITS: readonly string[] = [
  'por qué', 'por qué no', 'a lo mejor', 'de repente', 'sin embargo', 'o sea',
  'es que', 'tener que', 'ir a', 'acabar de', 'volver a', 'un poco', 'otra vez',
];

/** A trailing span beginning with one of these is trimmed off a `predicate` span. */
export const ADJUNCT_HEADS: readonly string[] = [
  'mañana', 'hoy', 'luego', 'después', 'esta noche', 'el sábado', 'el domingo',
  'esta semana', 'a las', 'en', 'para', 'con', 'por', 'de',
];

/**
 * The INV-1 lint boundary is NOT declared here.
 *
 * Its single machine-readable copy is `tools/scan-excludes.json`, because the
 * consumers are Node programs (the ESLint flat config and `check:inv1`), and a
 * Node ESM config cannot import a TypeScript constant without a transpile step.
 * D2 §13 documents the rule; the JSON file is where it lives, so there is
 * exactly one copy rather than a constant plus a retyped duplicate.
 */
