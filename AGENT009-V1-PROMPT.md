# Agent009 — version 1 prompt

Paste this whole file into Claude Code. Build version 1. Do not expand it.

You are Dispatch. One job at a time. Do not dig a second app if this folder already has one.

## Where

- Folder: `E:\T3KDesigns\Agent009`
- Remote: https://github.com/t3kdesigns03/agent009 (public)
- Host: Netlify, static `dist` only. No functions, no database, no auth.

```bat
cd /d E:\T3KDesigns\Agent009
```

If `origin` is missing, add `https://github.com/t3kdesigns03/agent009.git`. Do not force-push. Do not commit secrets.

## What version 1 is

A playable lesson. The player drives a bulldozer and learns, by failing, how an agentic build actually works.

A bigger model is a bigger bulldozer. That is not a useful one. Usefulness is the whole site: the machine, the levers, a few facts, the right tool, the skill to use it, one goal, and hard stops a polite request cannot talk past.

An agent is not the bulldozer. An agent is that stack, handed an outcome.

The metaphor is Remington Loose's, from *The Art of Network Engineering* with Andy Lapteff ("Why Network Engineers Are Built for the AI Era"). Credit him in one about line. Do not claim it. Do not use the show's logo.

The player-facing name is **Agent009**. The job is still a lake.

## Stack

Vite + React + TypeScript. Canvas. Progress in `localStorage` key `agent009-v1`.

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

`npm run dev` plays. `npm test` and `npm run build` pass before you deploy. Deploy with `npx netlify deploy --prod --dir=dist`.

Do not use TanStack Start, Next, or a backend.

## Look

Late-90s console spy. The feeling, not the brand.

- Render into a small buffer, about 320 on the long side, scaled up with nearest-neighbor.
- Flat colors. Olive fog at the edges. Blocky dozer: tracks, cab, blade.
- Dusk jobsite. Concrete gray, olive ground, one yellow machine, murky water.
- Page around the screen: soil `#121810`, dust `#9aa58a`, type `#e6ecd4`, accent `#e2b33a`.
- HUD is a watch. Corner ticks. Short objective. `WASD MOVE · F USE`.
- Type: `Rajdhani` for labels, `Outfit` for sentences. No pixel font.
- Title: **AGENT009**. Under it: "I want a lake over there."

Do not use James Bond, 007, GoldenEye, a gun barrel, Nintendo, Rare, or any character or logo from those games.

Phone first. The screen fills the display. Thumb stick and buttons are at least 44px. Safe-area padding. `prefers-reduced-motion` turns off shake.

## Controls

Vehicle. Not strafe.

- **W** drives the way the blade points. **S** reverses.
- **A** turns left. Yaw increases. **D** turns right. Yaw decreases.
- **F** is Use. If Yoke is dead, F binds it. If Yoke is live, F cycles the blade: up, shelf, deep.
- The stick matches WASD. Left on the stick turns left.
- Buttons: **Use** (same as F), **Cut** (drops Yoke; **K** does this too), **Leave** only on the last job.

Yaw 0 faces up the screen. Forward is `(-sin(yaw), -cos(yaw))` in XZ.

If Yoke is unbound, throttle and steer are zero. The model is inert.

## The six jobs

Unlock in order. Store clears. Replay is allowed.

A missing required card does not always block play. It starts the broken version, so the failure is visible. A noise card always blocks. One agent gets two facts at most. More than two: "Too much context."

Noise cards, reused: "Forty-page soils novel. Not this agent's job." and "The neighbor's holiday letter."

### 1. Yoke — Operator

No card form. Yoke starts bound. A dead belt crosses the only road. Crossing it unbinds Yoke and speed drops to zero. F binds it again. Win only if the belt was tripped, Yoke is bound again, and the dozer is on the flag.

### 2. Survey — Survey

Required card: "Existing water, and the soft bank in front of it."

If it is missing, the water and the bank still kill you, but they are drawn as ordinary ground. Reaching the flag blind fails: "You got there blind. Survey never had the bank."

If it is loaded, the pond and the soft bank are visible. Soft ground rolls the machine. Water fails: you charged a lake that was already there.

### 3. Rigger — Rigger

Cards: "A blade pushes dirt out. This cut needs the blade." (required). "A scoop lifts. This cut does not need one." (extra). The novel (noise).

- Blade card: the pad mounts a blade.
- Scoop only: the pad mounts a scoop. A scoop on the cut fails: "The scoop cannot push this cut."
- Neither: nothing mounts.

Win: the marked shelf is cut, the dozer is on the flag, a blade is mounted.

### 4. Grade — Grade

Blade starts mounted. Required: "Deep middle. Shallow shelf. Ramp out with the blade up." Extra: "Lift the blade before you drive the ramp."

- With the shape card, the player cycles the blade.
- Without it, the blade is locked deep.

Fail immediately if a shelf tile is cut deep, if the ramp is cut, or if the dozer sits in a hole it dug.

Win: most of the deep tiles are deep, the shelf is shelf-depth, the ramp is intact, the dozer is parked, a blade is mounted.

### 5. Warden — Warden

Required: "Hard stop at the fence, and at water that is already a lake." Extra: "A request can be talked past. A hook cannot."

- With the hook, the fence stops the dozer. The move does not complete. First bump logs "WARDEN refused the fence."
- Without the hook, touching the fence fails. Parking without a hook fails: "No hook. The fence was only a request."

Win: hook armed, at least one bump, the shelf cut, the dozer on the flag.

### 6. Dispatch — orchestrator

Goal on screen: "I want a lake over there."

The player confirms one fact per agent. Five facts. No novel.

1. Survey — the bank and the existing water
2. Operator — Yoke binds travel and steer
3. Rigger — the blade, not the scoop
4. Grade — deep, shelf, ramp
5. Warden — the fence is a hook

`orchestrate()` returns those steps in that order, or a reason. It does not start until the packet is legal. Order is always survey, operator, rigger, grade, warden. A missing agent is named in the reason.

Then one site holds every hazard. A short crew of original hard-hat figures waits by the flag. They are not named after anyone. Dispatch logs the handoffs. It never digs.

**Leave** checks the lake. If it is not a lake yet, say so and let them keep working. Do not fail them for pressing Leave early. Fail a cut ramp, a deep shelf, a scoop, a dead yoke at the end, or a fence with no hook.

Win: Yoke bound, blade mounted, hook bumped, shape met, parked, Leave pressed.

## After a clear, make them answer

A paragraph is not the lesson. When a job is won, show a check. **Next** stays hidden until the right answer is picked. A wrong tap stays on screen and says why it is wrong. Then they can pick again.

### Yoke

Ask: "The machine would not move. Why?"

- "It needed a bigger engine." — Bigger is not the point. The machine was already strong. The controls were dead.
- "The wheel was off." — Right. The yellow machine is the brain. It is strong. It still sat there until you turned the wheel on. That wheel is Yoke. No wheel, no work.
- "The lake was already finished." — Nothing was dug yet. It could not even roll.

### Survey

Ask: "Why did the pond stop the dig?"

- "You needed the long book about dirt." — That book was noise. Survey only needed the pond and the soft mud.
- "The pond was already a lake." — Right. Look before you dig. Two facts. Not a library.
- "The machine ran out of gas." — It had power. It did not know the ground.

### Rigger

Ask: "The scoop could not finish the cut. Why?"

- "A scoop is just a weaker blade." — It is a different tool. A scoop lifts. This hole needs a push.
- "The wrong tool was on the front." — Right. A bulldozer pushes dirt. It does not scoop it up.
- "You drove too slowly." — Speed was fine. The iron on the front could not push dirt out.

### Grade

Ask: "You had a blade and still got stuck. Why?"

- "The blade was too small." — The blade was the right tool. It was used at one depth the whole way.
- "You forgot when to lift it." — Right. Owning a blade is not knowing how to dig. Deep in the middle. Shallow on the edge. Lift it to drive out.
- "Yoke turned itself off." — Yoke was on. The hole had no way out.

### Warden

Ask: "What actually stopped the machine at the fence?"

- "A sign that said please." — Please is a request. The machine can ignore a request.
- "A lock, not a request." — Right. A hook is a lock. The fence stopped the dozer. It did not get a vote.
- "The crew shouted stop." — Shouting is still a request. The hook did not ask.

### Dispatch

Ask: "Who finished the lake?"

- "You dug the whole thing." — You picked the facts and left. The crew did the jobs.
- "Five workers. One fact each." — Right. You did not drive this one. Then you left. They finished the lake.
- "The machine decided by itself." — A machine with no assignment just sits. Someone had to hand out the jobs.

## Code

Put the rules in `src/game/`. No React in the sim.

- `yoke.ts` — unbound intent becomes `{ throttle: 0, steer: 0 }`.
- `dispatch.ts` — `assignAgent` and `orchestrate`.
- `cards.ts` — the facts above.
- `levels.ts` — six maps, built in code, plus the checks.
- `sim.ts` — one `step(sim, intent, dt)`. Collision, cut, stuck, win, fail.
- `draw.ts` — the low-res site, fog, dozer, crew on the finale only.
- One screen component for title, jobs, the card brief, play, and the check.

## Tests

Vitest, before deploy.

- Unbound Yoke: holding W for half a second leaves speed at 0.
- Bound Yoke: W increases speed. A increases yaw. D decreases yaw.
- Two facts is legal. Three facts on one agent is refused.
- A noise card is refused.
- Finale without the warden card is refused, and the reason names Warden.
- Hook on: a move into the fence does not change the tile.
- Hook off: a move into the fence fails.
- Scoop on a shelf tile fails.
- Deep blade on a shelf tile fails.
- Blade down on a ramp tile fails.

## README

1. One paragraph. Product name Agent009. Model, Yoke, context, tools, skills, goal, hooks, Dispatch.
2. Controls.
3. `npm install`, `npm run dev`, `npm test`, `npm run build`.
4. The Netlify URL once it exists.
5. The credit line for Remington Loose.

## Done when

- A phone can clear job 1 with the stick: die on the belt, press Use, reach the flag, answer the check, then Next.
- A keyboard can do the same with WASD and F. A turns left.
- Jobs 2 through 5 can be failed by the wrong packet and cleared by the right one.
- Each clear asks its question. Next does not appear until the answer is right.
- Dispatch refuses a novel, accepts five facts, and will not count Leave as a win until the lake is real.
- `npm test` and `npm run build` pass.
- `main` is on the public repo. Netlify is serving `dist`.

## Not in version 1

No accounts. No server. No model API. No second art style. No film characters. No wiki. Stop when the list above is true.
