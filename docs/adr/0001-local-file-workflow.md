# Use Local Files for the First Production Workflow

The first version of the Novel Production System will use local files, command-line tasks, and agent workflows instead of a database-backed web application. This keeps Creative Briefs, Deconstruction Reports, Material Libraries, Project Story Bibles, chapters, and review reports easy to inspect and edit while the domain structure is still changing.

**Considered Options**

- Local Markdown/YAML/JSON files
- Database-backed web application

**Consequences**

Markdown with YAML front matter is the default for human-reviewed artifacts, while JSON is reserved for machine-readable indexes, entity tables, relationship graphs, and timelines.
