# Allow Production Capabilities to Update Files Directly

Production Capabilities may directly update Material Libraries, Project Story Bibles, Creative Blueprints, and other production files instead of always stopping at candidate artifacts for manual ingestion. This keeps the Local Agent Workflow useful as an active production system, while requiring every direct update to leave a Capability Change Record for auditability and later correction.

**Considered Options**

- Require human approval before every library or story-bible update
- Allow direct capability updates with change records

**Consequences**

The system must prioritize clear change logs and reversible file edits, because correctness is enforced through traceability and later correction rather than mandatory pre-approval for every update.
