# Version Production Assets with Git

All production assets for the Novel Production System will live in a Git repository, including Global Material Libraries, Project Material Libraries, Project Story Bibles, Creative Blueprints, chapters, review reports, and capability outputs. Each Direct Capability Update should be committed as a Git commit so changes are traceable, diffable, and reversible without building a separate rollback system.

**Considered Options**

- Maintain custom run directories and rollback files
- Use Git as the version history for all production assets

**Consequences**

Capability implementations should make small, coherent commits with clear messages that identify the capability invocation and affected assets. Human edits can also be committed, but agent-made commits should remain easy to distinguish from manual changes.
