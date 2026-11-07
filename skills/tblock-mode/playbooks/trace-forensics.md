### Trace forensics

**You own the diagnosis from the artifact.** The deliverable is a cited diagnosis, not a fix.

Distinct from [Runtime forensics](runtime-forensics.md), which instruments the live process. Here the capture already exists: a CPU profile, a performance trace, a spindump, a heap snapshot, or a crash dump. The artifact is a fixed dataset. Read it, don't re-run it. Keep the tooling generic: a DevTools or trace parser for `.cpuprofile` and `.json.gz` traces, a text editor for a spindump, the runtime's heap tooling for a heap snapshot.

1. Identify the format and load it with the right tool. Parse large artifacts in a subagent on the `swarm workers` role, per [Guard the Context Window](../../principle-guard-the-context-window/SKILL.md), and keep the reduced finding in the main thread.
2. Transform the raw artifact into a form you can query. Dump the trace or heap snapshot into SQLite, one row per sample, frame, or node. Reach the queryable shape before you read.
3. Narrow to the cause. Query for the frames that hold the most time and walk the call tree to the hot path. For a leak, follow the retainer chain from the leaked object to a GC root. For a spindump, find the thread stuck on-CPU or blocked, and its wait reason.
4. When the artifact carries timestamps and the project has `.tblock/probe.json`, read the app's logs over the capture's window with the [probe](../../probe/SKILL.md) skill, and line up errors with the hot section. Say when the logs no longer reach back that far.
5. Attribute to source. Map the hot frame to file, symbol, and line through the artifact's own symbols. A frame with no source mapping is not yet a diagnosis. Resolve the symbols, or say plainly that the artifact does not carry them.
6. If you have a paired capture, diff the before and after artifacts to confirm. Otherwise, mark the finding as the strongest hypothesis the artifact supports, not a confirmed cause.
7. Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only forensics`.

**Reply:** the artifact and its format, the reduced finding, what the logs showed over the window, the source location, the artifact paths, and whether a paired capture confirmed it. No fix unless asked. Hand back to [Bug fix](bug-fix.md) or [Perf issue](perf-issue.md) once the cause is known.
