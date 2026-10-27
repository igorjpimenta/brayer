# Brayer — positioning

**Ink the work, not the transcript.**

## One line

Brayer is the vendor-neutral command layer for agent work: work orders in,
verified handoffs out.

## Why the name

A brayer is the printer's small hand roller that applies ink evenly to type. It
does not rewrite the page, and it does not keep the manuscript. It puts the ink
exactly where the work needs it.

Agents do not need another place to dump transcripts. They need the right context
applied to the work at the right moment. That is the product: apply the order,
the checkpoint, the proof and the decision to the work — not another conversation
to the context window.

## The problem

Operators running several coding agents do not fail because the model cannot
generate. They fail because work is lost at the boundaries:

- a session dies and the next one starts from zero;
- an agent says “done” and the operator has to read the trace to verify it;
- two agents collide in the same workspace;
- a merge or deploy needs a human decision but there is no gate;
- spend and model choice are invisible until the invoice.

## The product

A work order moves through a controlled loop:

```text
order -> claim (lease) -> attempt -> checkpoint -> evidence
      -> review -> verdict -> approved / rejected / blocked
      -> resume with the latest checkpoint
```

- **Orders** carry acceptance, workspace, budget and approval mode.
- **Claims** are atomic leases; a race loser gets nothing.
- **Checkpoints** are a structured handoff with a tree hash, not a transcript.
- **Evidence** is content-addressed: diff, tests, screenshots, artifacts.
- **Verdicts** are recorded decisions; approve requires evidence.
- **Resume** returns the order to the queue with its checkpoint.

## Who it is for

Technical operators who run a fleet of coding agents across repos and harnesses
and want to supervise by exception. Local-first, vendor-neutral, priced for one
operator before it is priced for an enterprise.

## The wedge

**The session that never dies.** Kill an agent mid-task, let the lease expire, and
resume the same work in another harness with no re-brief.

## What it is not

- Not another coding agent or model.
- Not a no-code agent builder.
- Not an enterprise governance suite on day one.
- Not a memory product that stores transcripts and calls it learning.
- Not a desktop UI that owns the only copy of the state.

## Proof metric

Verified tasks completed per human hour. The first proof is 20 kills with a 95%
resume rate and 70% fewer re-brief tokens.
