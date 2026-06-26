# Long-Form Web Novel Production

This context defines the domain language for a system that helps produce serialized long-form web novels with AI assistance and human editorial control.

## Language

**Novel Production System**:
The overall system that supports semi-automated long-form web novel production through research, material management, book analysis, blueprint generation, chapter drafting, review, and human acceptance.
_Avoid_: Single novel project, one-off writing prompt

**Local Agent Workflow**:
The first-version system shape where novel production runs through local files, command-line tasks, and agent workflows rather than a full web application.
_Avoid_: First-version web app, UI-first workflow

**Production Capability**:
A reusable task capability in the Novel Production System, such as research, Book Deconstruction, Story Setting generation, Full-Novel Outline generation, or Chapter Treatment generation.
_Avoid_: One-off prompt, permanent workflow state

**Capability Invocation**:
A single run of a Production Capability, started either by a human request or by an agent when the current novel production task needs that capability.
_Avoid_: Hidden side effect, unmanaged background work

**Capability Artifact**:
The durable output produced by a Capability Invocation, such as a Deconstruction Report, research report, generated setting draft, outline draft, treatment draft, or direct update to a target library or story bible.
_Avoid_: Invisible context update, unrecorded mutation

**Direct Capability Update**:
A Capability Invocation that directly modifies a Material Library, Project Story Bible, Creative Blueprint, or other production file as part of completing its task.
_Avoid_: Manual-only update, hidden edit

**Capability Change Record**:
The audit record left by a Direct Capability Update, describing what changed, which capability made the change, what inputs or sources were used, and why the change was made.
_Avoid_: Unlogged change, silent mutation

**Semi-Automated Serial Production**:
A production mode where the system drafts one or more publishable chapter candidates on a recurring cadence, while a human editor retains control over direction, acceptance, and final release.
_Avoid_: Fully automated novel generation, one-click million-word generation, author assistant

**Creative Blueprint**:
The approved pre-production package required before chapter drafting begins. It contains the Story Setting, Full-Novel Outline, and Chapter Treatment.
_Avoid_: Prompt, idea dump, rough notes

**Creative Brief**:
The structured starting input for Creative Blueprint generation, describing genre, target reader, platform direction, length target, core hook, constraints, reference direction, and expected serialization cadence.
_Avoid_: Vague idea, free-form prompt only

**Brief Completion Flow**:
The system-guided clarification process that turns a vague story idea into a Creative Brief by proposing defaults and asking for missing production decisions.
_Avoid_: Direct blueprint generation from a vague idea

**Project Story Bible**:
The per-novel production record that contains the approved Creative Blueprint and evolving canon such as settings, outline, characters, relationships, factions, map, timeline, unresolved hooks, and accepted chapter facts.
_Avoid_: Global Material Library, raw research folder

**Reference-Canon Boundary**:
The separation between a Project Material Library as reference material and a Project Story Bible as decided or accepted novel truth.
_Avoid_: Treating references as canon

**Planned Story Change**:
A change to future-facing or not-yet-canonized parts of the Project Story Bible, such as later outline, unrevealed setting, or characters that have not entered accepted chapters.
_Avoid_: Canon rewrite, accepted chapter fact change

**Canon Change**:
A change to facts already established by Final Chapter Acceptance, requiring explicit change tracking and impact analysis across continuity.
_Avoid_: Silent retcon, plan adjustment

**Story Setting**:
The stable facts and rules of a novel, including characters, world, factions, power system, tone, genre promises, and constraints.
_Avoid_: Background material, random lore

**Male-Frequency Genre Lane**:
The target market lane for the system's first novels, centered on plot momentum, protagonist progression, conflict escalation, and serial reader retention.
_Avoid_: All fiction genres, generic novel writing

**Supported Genre Family**:
A genre family that the system may produce with its own expectations for setting, progression, review criteria, and reader promises. The initial candidates are xuanhuan, xianxia, urban rebirth, and science fiction.
_Avoid_: Universal genre support, arbitrary style tag

**Shared Serial Grammar**:
The common male-frequency serial fiction pattern shared across Supported Genre Families, including protagonist progression, escalating conflict, payoff rhythm, chapter hooks, and reader-retention pacing.
_Avoid_: Universal storytelling theory, genre-neutral writing rule

**Genre Constraint**:
The genre-specific promise or rule that modifies the Shared Serial Grammar for a Supported Genre Family, such as cultivation realms in xianxia or technology plausibility in science fiction.
_Avoid_: Optional flavor, decoration

**Research Capability**:
The system capability for gathering and organizing market trends, male-frequency tropes, genre reference material, and writing-method knowledge before or during novel production.
_Avoid_: Casual web search, prompt stuffing

**Material Library**:
The curated source of reusable references, examples, tropes, settings, character patterns, plot devices, and style samples used by the Novel Production System.
_Avoid_: Random notes, model memory

**Global Material Library**:
The cross-project Material Library that accumulates broad male-frequency patterns, research findings, genre references, and deconstruction outputs for reuse across novels.
_Avoid_: Single-novel context, project-specific canon

**Project Material Library**:
The per-novel Material Library selected and adapted from the Global Material Library and project-specific research to guide one novel's production.
_Avoid_: Global dump, Canon Record

**Source Material Layer**:
The traceable layer of the Material Library that keeps original references, links, excerpts, deconstruction outputs, research notes, and source metadata.
_Avoid_: Unattributed memory, reusable pattern

**Reusable Pattern Layer**:
The abstracted layer of the Material Library that stores reusable creative patterns such as opening moves, cheat systems, antagonist pressure, progression rhythm, chapter hooks, and payoff designs.
_Avoid_: Raw source dump, copied plot

**Pattern Reuse Boundary**:
The rule that reusable patterns may transfer structure, rhythm, and function, but not distinctive wording, proprietary names, unique event chains, or recognizable combinations from a source work.
_Avoid_: Plot copying, surface-level paraphrase

**Book Deconstruction**:
The system capability for analyzing existing novels into reusable structural observations, such as premise, pacing, arc shape, conflict pattern, hooks, payoffs, character roles, and genre promises.
_Avoid_: Plagiarism, copying chapters

**Deconstruction Report**:
The structured output of Book Deconstruction, containing observations, reusable patterns, source notes, and any resulting Direct Capability Updates to a Material Library.
_Avoid_: Copied source notes, unlogged material update

**Production-Oriented Deconstruction**:
The Book Deconstruction approach that extracts reusable production knowledge such as opening design, core hook, protagonist progression, cheat system, conflict escalation, map or faction expansion, chapter hooks, payoff rhythm, reader expectation management, reusable patterns, and reuse risks.
_Avoid_: Literary criticism, plot recap only

**Primary Novel Text**:
A novel text supplied by the user in a file or similar direct input for Book Deconstruction.
_Avoid_: Automatically scraped novel text, reader commentary

**Secondary Deconstruction Source**:
A public book review summary or book-deconstruction video used as indirect input for Book Deconstruction when Primary Novel Text is unavailable or insufficient.
_Avoid_: Raw novel chapter scraping, ordinary reader comment as content source

**Engagement Credibility Signal**:
The popularity and reception evidence used to estimate the reliability of a Secondary Deconstruction Source, especially likes on the source itself and likes on related comments.
_Avoid_: Treating all secondary sources as equally reliable

**Secondary Source Credibility Score**:
A simple combined reliability estimate for a Secondary Deconstruction Source, based on engagement, creator quality, and corroboration by other sources.
_Avoid_: Like count only, unscored secondary source

**Pre-Production Pipeline**:
The first-priority system workflow that turns Research Capability, Material Library inputs, and Book Deconstruction findings into an approvable Creative Blueprint before any Chapter Draft is produced.
_Avoid_: Chapter drafting workflow, direct generation

**Full-Novel Outline**:
The high-level structure of the whole novel, including the main premise, major arcs, turning points, ending direction, and volume-level progression.
_Avoid_: Chapter plan, synopsis

**Chapter Treatment**:
The detailed chapter-by-chapter plan created before drafting prose. Each Chapter Treatment item describes what a chapter must accomplish before the Chapter Draft is written.
_Avoid_: Full-Novel Outline, scene draft

**Chapter Draft**:
A complete prose candidate for one serial chapter, produced from the approved Creative Blueprint and still subject to human editorial acceptance.
_Avoid_: Scene, fragment, final published chapter

**Next-Chapter Production**:
An on-demand production mode where the system drafts the next chapter only when requested, using the approved Creative Blueprint and the accepted prior chapters as context.
_Avoid_: Daily batch production, scheduled auto-publication

**Automated Chapter Review**:
The system-led quality gate applied after a Chapter Draft is produced. It checks continuity with prior chapters, consistency with Story Setting, prose naturalness, and alignment with the Full-Novel Outline.
_Avoid_: Human acceptance, proofreading only

**Chapter Review Report**:
The traceable record of Automated Chapter Review outcomes for a chapter, including findings, revision summaries, and final review status.
_Avoid_: Pass/fail flag, hidden model reasoning

**Review Revision Loop**:
The repeated cycle where the system revises a Chapter Draft based on failed Automated Chapter Review findings, then reviews the revised draft again until it passes or reaches the agreed stopping limit.
_Avoid_: Single-pass generation, endless rewriting

**Human Intervention Chapter**:
A Chapter Draft that did not pass Automated Chapter Review within the agreed revision limit and requires human editorial work before it can receive Final Chapter Acceptance.
_Avoid_: Failed chapter, auto-accepted exception

**Final Chapter Acceptance**:
The human editorial decision that a reviewed Chapter Draft is accepted as the final version of that chapter.
_Avoid_: Automated review pass, generated draft

**Canon Record**:
The accepted continuity record of the novel, formed only from the approved Creative Blueprint and chapters that have received Final Chapter Acceptance.
_Avoid_: Draft memory, review notes, temporary context

**Blueprint Approval**:
The human editorial decision that a Creative Blueprint is ready to guide Chapter Draft production.
_Avoid_: Auto-approval, model self-review

## Example Dialogue

Developer: "Should the system publish chapters automatically after generation?"

Domain Expert: "No. In Semi-Automated Serial Production, the system drafts chapters, but a human editor decides what becomes canon and what gets released."

Developer: "Should the first version start with a web application?"

Domain Expert: "No. The first version is a Local Agent Workflow focused on stable production files and review gates."

Developer: "Are Book Deconstruction and research just fixed states in a workflow?"

Domain Expert: "No. They are Production Capabilities that can be invoked manually or by an agent, producing Capability Artifacts and direct updates with Capability Change Records."

Developer: "Can we start drafting chapter one from just a premise?"

Domain Expert: "No. A Chapter Draft starts only after the Creative Blueprint is approved: Story Setting, Full-Novel Outline, and Chapter Treatment."

Developer: "Can the system generate a Creative Blueprint from an unstructured idea alone?"

Domain Expert: "No. Creative Blueprint generation starts from a Creative Brief."

Developer: "What happens when the user only provides a vague premise?"

Domain Expert: "The system runs a Brief Completion Flow before generating a Creative Blueprint."

Developer: "Are we building a generic fiction writer?"

Domain Expert: "No. The first system targets the Male-Frequency Genre Lane, with specific Supported Genre Families."

Developer: "Do the Supported Genre Families need completely separate systems?"

Domain Expert: "No. They share a Shared Serial Grammar, but each Supported Genre Family still has Genre Constraints."

Developer: "Are we choosing the protagonist path before building the system?"

Domain Expert: "No. The first priority is the Novel Production System and its capabilities, not a specific novel's protagonist path."

Developer: "Should the Material Library keep raw references or only distilled patterns?"

Domain Expert: "Both. The Source Material Layer preserves traceability, while the Reusable Pattern Layer supports generation."

Developer: "Can one global library directly serve as the context for every novel?"

Domain Expert: "No. The Global Material Library is reusable across novels, while each novel has a Project Material Library and a Project Story Bible."

Developer: "Can project reference material be treated as facts in the novel?"

Domain Expert: "No. The Reference-Canon Boundary keeps the Project Material Library separate from the Project Story Bible."

Developer: "Can the Project Story Bible change during production?"

Domain Expert: "Yes, but Planned Story Changes and Canon Changes are different. Canon Changes require explicit tracking and continuity impact analysis."

Developer: "Can a Reusable Pattern be copied directly into a new novel?"

Domain Expert: "No. The Pattern Reuse Boundary allows structure and function to transfer, not distinctive expression or recognizable source-specific combinations."

Developer: "Should we build chapter drafting before research and blueprint generation?"

Domain Expert: "No. The Pre-Production Pipeline comes first, because Chapter Drafts depend on an approved Creative Blueprint."

Developer: "Can the system fetch raw novel chapters from the web for Book Deconstruction?"

Domain Expert: "No. Book Deconstruction uses Primary Novel Text supplied by the user, or Secondary Deconstruction Sources such as book review summaries and deconstruction videos."

Developer: "Can ordinary reader comments become deconstruction content?"

Domain Expert: "No. Reader comments are not deconstruction content, but their engagement can contribute to the Engagement Credibility Signal for a Secondary Deconstruction Source."

Developer: "Is a secondary source reliable just because it has many likes?"

Domain Expert: "No. It receives a Secondary Source Credibility Score that combines engagement, creator quality, and corroboration."

Developer: "Do Book Deconstruction findings go directly into the Material Library?"

Domain Expert: "Yes. Book Deconstruction may directly update a Material Library, but it must leave a Capability Change Record."

Developer: "Is Book Deconstruction a literary review?"

Domain Expert: "No. It is Production-Oriented Deconstruction for reusable web-novel production knowledge."

Developer: "Can the system mark its own Creative Blueprint as ready?"

Domain Expert: "No. Blueprint Approval is a human editorial decision."

Developer: "If the Automated Chapter Review passes, is the chapter final?"

Domain Expert: "No. A chapter becomes final only after Final Chapter Acceptance by a human editor."

Developer: "Do we only need to know whether review passed?"

Domain Expert: "No. Each chapter needs a Chapter Review Report so findings and revisions remain traceable."

Developer: "Should the system keep rewriting forever if review keeps failing?"

Domain Expert: "No. A chapter that reaches the revision limit becomes a Human Intervention Chapter."

Developer: "Should facts introduced in a rejected draft be remembered for future chapters?"

Domain Expert: "No. The Canon Record is updated only from the approved Creative Blueprint and chapters with Final Chapter Acceptance."
