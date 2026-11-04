# Agent009

**Agent009** is a learn-and-do lesson in how an AI agent works, on one bulldozer site. A bigger model is a bigger bulldozer, which doesn't make it a useful one. Useful is the whole stack: the **model** (the machine), its **tools** (the yoke that binds it to the tracks, and the iron on the front), its **context** (a three-slot packet of facts you perceived), a **plan** (a work order you grade before anyone drives), **guardrails** (a hook a polite request can't talk past), an **Orchestrator** that dispatches several agents, and the **harness**: the loop that runs every one of them (perceive → plan → act → observe → check → repeat or hand off).

You are the operator. The agent is the yellow stack. In Jobs 1–3 you drive by hand. In Job 4 you write and grade the plan, and the agent can drive it. In Job 5 you pick the rule and test it. In Job 6 you dispatch four agents and never touch a lever.

## One site, six jobs

Same dig, next step. What you scan, cut and decide carries over to the next job (saved in your browser).

| # | Job | Block | You do |
| --- | --- | --- | --- |
| 1 | YOKE | Tools: binding | Bind the yoke, cross the dead belt (it drops the link), re-bind, reach the survey point. K is your kill switch, drawn differently. |
| 2 | SURVEY | Context | Scan (F) the unsurveyed field, find the soft bank in front of the existing water, route around it, write a 3-slot context packet. |
| 3 | RIGGER | Tools: selection | Pick blade, bucket or ripper **in the scene** at the rack, then cut shelf row 4 (A4–F4, **6 cells**). AUTO drives your work order once you've chosen. |
| 4 | GRADE | Plan | Grade a flawed draft plan, fix it, run it (the agent drives) or drive it yourself. Before / plan / after comparison. |
| 5 | WARDEN | Guardrails | Pick hook, request, approval gate or "bigger model". Test the fence, cut the overflow channel, then watch what stops a very polite radio request. |
| 6 | DISPATCH | Orchestrator + harness | Assign SCOUT, DOZER, LOADER and TRUCK, set their packets and who waits for whose handoff, watch them run in parallel, merge, fill the lake, LEAVE. |

Every clear shows a dashboard with real numbers (distance, time, retries, hazards, tool calls, context items, cells revisited, waste) and an **efficiency score out of 100**, plus a four-part debrief (what happened · what it is in an agent · next time · what's next) with a second example that uses no bulldozer. Each check asks about what you actually hit. A wrong answer explains itself, costs points, and must be acknowledged before you pick again.

## Controls

| Action | Keyboard | Phone |
| --- | --- | --- |
| Drive / turn | W S A D (or arrows) | Point the stick where you want to go |
| Use: bind, scan, mount a tool, lower / raise the blade | F or Space | **F** button (it always shows what it will do) |
| Cut the yoke (kill switch) | K | **K · CUT** |
| Hand the work order to the agent (Jobs 3–4) | — | **AUTO** |
| Leave (Job 6) | L | **LEAVE** |
| Restart / jobs / vocabulary | R / Esc / ? | ↻ / ✕ / ? |

Progress stays in `localStorage` under `agent009-v1` (same key as v1, so earlier unlocks carry over). No account, no server, no API keys.

## Run it

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # Vitest: plays every job, including the failures
npm run build   # static site in dist/
```

## Live

https://agent0067.clidk.com

## Credit

The bulldozer metaphor is Remington Loose's, from *The Art of Network Engineering* with Andy Lapteff ("Why Network Engineers Are Built for the AI Era").
