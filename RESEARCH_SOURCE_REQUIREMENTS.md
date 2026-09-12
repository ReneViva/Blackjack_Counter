# Research Source Requirements

## 1. Purpose

This document defines the Phase 19 gate for research-system definitions. It
answers one question: what evidence and metadata must exist before a named
research system may be used by executable comparison code?

The gate is source-neutral. It does not approve a particular publication,
definition, normalization, or historical variant. The exact finite-shoe
composition model remains the project's reference model. A research-system
definition is only a reproducible, compressed description to be evaluated
against that reference.

Phase 19 does not authorize a score engine, chronological count, normalized
casino count, wager model, action recommendation, or live-casino assistance.

## 2. Source authority rules

A definition may advance toward approval only when its source is supplied
through the project's authorized source process. Acceptable authority must be
decided by the instructor or other designated project reviewer; presence on
the public internet alone is not approval.

For every proposed source:

- preserve enough bibliographic information to identify the exact work;
- identify the edition, revision, or version when one exists;
- record a page, section, table, figure, or other precise locator when
  available;
- preserve a permitted URL or complete bibliographic reference;
- distinguish the primary definition source from explanatory or secondary
  material;
- record who approved and who verified the source, and when;
- do not promote examples, snippets, recollections, or inferred values into a
  definition;
- do not treat the illustrative scores in `TECHNICAL.md` as definitions.

If a source cannot be inspected or its exact version cannot be identified, the
record remains unresolved.

## 3. Required definition metadata

Each future research-definition record must contain the following fields. A
field may be marked `not_applicable` only with a source-supported explanation;
absence is not equivalent to non-applicability.

### Identity

- stable, nonempty research-system identifier;
- human-readable label;
- definition-record revision;
- lifecycle state: `unresolved`, `in_review`, `conflicting`, or `approved`.

### Source and provenance

- source title;
- source author or responsible organization;
- source edition, revision, publication date, or an explicit statement that
  the source has no version marker;
- precise source locator when available;
- permitted source URL or complete bibliographic reference;
- source type and whether it is primary or secondary;
- provenance describing how the source entered the project;
- approving authority and approval record;
- verifier identity and date verified.

### Mathematical definition

- the complete domain of card ranks or source-defined card categories;
- one source-supported tag for every member of that domain;
- an explicit statement that the mapping is complete;
- balanced or unbalanced classification when the source supports it;
- level or other classification when the source supports it;
- initial-state and reset convention;
- score representation and numeric precision requirements;
- source-defined normalization or conversion rule, or an explicit
  source-supported statement that none applies;
- the observable input scope to which the definition applies;
- any boundary conditions needed to reproduce the definition.

### Auxiliary parameters

- whether an auxiliary parameter exists;
- its relationship to the primary definition;
- its source-defined input category, state, update, reset, output, and
  interpretation rules;
- whether it is independent, combined, or used only as a separate research
  feature;
- its own source locator if different from the primary definition.

### Ambiguity and verification

- known aliases and naming ambiguity;
- known version, edition, or normalization ambiguity;
- conflicts found across approved candidate sources;
- the resolution decision and supporting authority, when resolved;
- verification notes and reproducible review evidence;
- explicit executable-eligibility result and reason.

No named system's rank/tag mapping is recorded in this Phase 19 artifact.

## 4. Definition completeness checklist

A record is complete only when every applicable item below is satisfied:

- [ ] The identifier and label are stable and nonempty.
- [ ] The approving authority is identified.
- [ ] Source title and author or organization are present.
- [ ] Edition, revision, or explicit no-version evidence is present.
- [ ] A precise locator or justified locator-unavailable statement is present.
- [ ] A permitted URL or complete bibliographic reference is present.
- [ ] Provenance, verifier, and verification date are present.
- [ ] The mathematical domain is explicit and covers every required rank or
      source-defined category exactly once.
- [ ] Mapping completeness has been checked against the approved source.
- [ ] Initial-state, update, and reset semantics are explicit.
- [ ] Numeric representation and precision are explicit.
- [ ] Balanced/unbalanced and level classifications are recorded when the
      approved source supports them.
- [ ] Normalization/conversion behavior is explicit or source-supported as not
      applicable.
- [ ] Every auxiliary parameter is fully defined or source-supported as absent.
- [ ] Alias, version, edition, and normalization ambiguities have been reviewed.
- [ ] All candidate-source conflicts are resolved by the approving authority.
- [ ] A verifier has reproduced the definition from the cited locator.
- [ ] The record is marked `approved` only after every applicable check passes.

An unresolved or conflicting record is never executable. A partially complete
record is never treated as a default.

## 5. Version and edition handling

The record identifies the exact source version before mathematical values are
accepted. Different editions, historical variants, scale transformations, or
normalization conventions must be separate candidate definitions until an
authorized reviewer determines whether they are mathematically equivalent.

Aliases do not establish equivalence. A shared name does not permit selecting
one variant silently. If equivalence is claimed, the review record must state
the transformation and cite the source evidence supporting that claim.

When the repository names a system but supplies no edition or version, its
version status is `unresolved`; it is not assumed to be the most common or most
recent variant.

## 6. Conflict handling

When candidate sources disagree:

1. preserve each candidate's bibliographic identity and exact locator;
2. describe the disputed fields without choosing values from memory;
3. mark the research record `conflicting` and executable eligibility `false`;
4. request a written resolution from the approving authority;
5. record the accepted source/version and rationale if the conflict is
   resolved;
6. repeat completeness and independent verification checks after resolution.

A majority of secondary sources does not override the authorized-source
process. Conflicts must not be hidden by averaging or merging definitions.

## 7. Verification process

The source-controlled review sequence is:

1. Register the proposed record as `unresolved` with executable eligibility
   set to `false`.
2. Attach complete source and provenance metadata.
3. Transcribe the proposed mathematical definition from the cited locator.
4. Have a verifier compare every field with the exact source edition.
5. Check coverage, numeric representation, initialization, reset,
   normalization, and auxiliary-parameter semantics.
6. Search the approved source set for aliases, variants, and conflicts.
7. Obtain explicit approval from the designated authority.
8. Record verifier, approval, and date information in source control.
9. Mark the record `approved` and executable-eligible only if the completeness
   checklist has no unresolved applicable item.
10. Review the proposed executable diff separately before Phase 20 begins.

Any later source revision invalidates executable eligibility until the changed
record is reviewed again.

## 8. Current named-system status

Repository inspection for this gate covered `CODEX_WORKFLOW.md`, `THEORY.md`,
`TECHNICAL.md`, and `README.md`, plus a repository-wide named-system search.
The current documents provide general mathematical framing and require future
instructor-approved sources. They do not provide a named system's complete
mapping, author, edition, locator, or system-specific bibliographic reference.

The status codes used here are:

- **A**: explicit complete executable definition;
- **B**: descriptive mention;
- **C**: external citation/reference only;
- **D**: conflicting or version-dependent definitions;
- **E**: no sufficient definition.

### Wong Halves

- Current status: **B and E**.
- Present: a descriptive theoretical role and illustrative API identifier.
- Not present: a complete mapping or the source metadata required by this
  gate.
- External citation only: no system-specific citation exists locally.
- Version status: unresolved because no edition/version is supplied; no local
  conflict is documented.
- Executable eligibility: false.

### Zen Count

- Current status: **B and E**.
- Present: a descriptive theoretical role and illustrative API identifier.
- Not present: a complete mapping or the source metadata required by this
  gate.
- External citation only: no system-specific citation exists locally.
- Version status: unresolved because no edition/version is supplied; no local
  conflict is documented.
- Executable eligibility: false.

### Omega II

- Current status: **B and E**.
- Present: a descriptive theoretical role and illustrative API identifier.
- Not present: a complete mapping or the source metadata required by this
  gate.
- External citation only: no system-specific citation exists locally.
- Version status: unresolved because no edition/version is supplied; no local
  conflict is documented.
- Executable eligibility: false.

### Ace Side Counting

- Current status: **B and E**.
- Present: a descriptive auxiliary-feature concept and illustrative response
  fields.
- Not present: an approved primary definition to which it applies, complete
  auxiliary semantics, or the source metadata required by this gate.
- External citation only: no system-specific citation exists locally.
- Version status: unresolved because no edition/version is supplied; no local
  conflict is documented.
- Executable eligibility: false.

The general probability, confidence-interval, dynamic-programming, and gaming
regulation references in the authoritative documents are not definition
sources for these four named systems.

## 9. Prohibition on guessing or inference

No missing definition value may be supplied from model memory, common usage,
web snippets, numerical examples, a similarly named system, or an inferred
pattern. No named operational mapping may be encoded in Python, TypeScript,
JSON, fixtures, tests, constants, or Markdown tables before approval.

Illustrative scores and abstract equations in existing documents do not imply
card tags. A balanced/unbalanced label, level, normalization rule, initial
state, auxiliary behavior, or variant must remain unresolved unless the
approved source states it.

Phase 19 introduces no executable count arithmetic and no synthetic fixture;
the document itself is sufficient to establish the gate.

## 10. Handoff criteria for Phase 20

Phase 20 is **NOT READY** while every currently named research system remains
unresolved. Starting Phase 20 requires at least one approved, complete,
executable-eligible definition delivered through the authorized source
process.

For each current named system, the missing source requirements are:

- approved source title;
- source author or responsible organization;
- edition/revision/publication identity;
- precise locator where available;
- permitted URL or complete bibliographic reference;
- provenance and approving authority;
- verifier and verification date;
- complete source-supported domain and rank/tag mapping;
- mapping-completeness confirmation;
- initial-state, update, and reset semantics;
- numeric representation and precision;
- source-supported classification fields;
- normalization/conversion rule or source-supported non-applicability;
- complete auxiliary-parameter definition or source-supported absence;
- alias/version/edition/normalization review;
- conflict resolution if candidate sources disagree;
- explicit approval and executable-eligibility decision.

Ace Side Counting additionally requires an approved statement of the primary
definition, if any, with which the auxiliary feature is associated and whether
the feature is independent, combined, or retained only as a separate research
variable.

After those requirements are met, Phase 20 still needs a new explicit prompt.
This document does not authorize or begin it.
