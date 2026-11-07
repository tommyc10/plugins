### Runtime forensics

**You own the diagnosis. Instrument the live process, don't theorize from source.** The deliverable is a cited diagnosis, not a fix. Use this for a live symptom such as a leak, a spinning CPU, a hang, or a visual glitch. A capture someone hands you after the fact is [Trace forensics](trace-forensics.md).

1. Reproduce the symptom on the surface where it occurs: the project's verification skill when it has one, the harness's browser tools for a web app, or screen control (computer use in Claude Code, the screen-control tools in GitHub Copilot) for a desktop app the other tools can't reach. Note the start and end time of the reproduction.
2. Capture the live signal while it happens: a CPU profile for a spinning process, a heap snapshot for a leak, a performance trace for a glitch or jank, a thread dump or `sample` for a hang. Use the runtime's own tools, such as DevTools or CDP, `node --cpu-prof`, `py-spy`, `perf`, or Instruments. A real artifact, not a guess.
3. Read the app's logs over the same window with the [probe](../../probe/SKILL.md) skill, a `--since` that covers the reproduction and a `--grep` for its request or session id. Line up the first error or warning with the capture's timeline.
4. Reduce the artifact to the smoking gun: the function on the hot path, the retainer chain from the leaked object to a GC root, the loop firing without input. Parse large artifacts in a subagent on the `swarm workers` role, per [Guard the Context Window](../../principle-guard-the-context-window/SKILL.md), and keep the reduced finding in the main thread.
5. Prove the mechanism before believing it. Inject instrumentation into the running process, such as a CDP evaluation or a temporary log line, and confirm the hypothesis cheaply. Remove every temporary change when you are done.
6. Map the finding back to source: file, symbol, and the line that allocates, schedules, or blocks.
7. Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only forensics`.

**Reply:** the symptom and surface, the signal captured, what the logs showed over the window, the reduced finding, how you proved the mechanism, the source location, and the artifact paths. No fix unless asked. Hand back to [Bug fix](bug-fix.md) or [Perf issue](perf-issue.md) once the cause is known.
