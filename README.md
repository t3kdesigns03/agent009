# Agent009

**Agent009** is a playable lesson: you drive a bulldozer and learn, by failing, how an agentic build actually works. The big yellow machine is the **model** — strong, and useless on its own. **Yoke** is the wheel that binds travel and steer; without it the model sits. **Context** is the few facts an agent is handed (two at most — a forty-page novel is noise). **Tools** are the iron on the front: a blade pushes, a scoop lifts. **Skills** are knowing how to use the tool: deep in the middle, shallow on the shelf, blade up for the ramp. The **goal** is one sentence: "I want a lake over there." **Hooks** are hard stops a polite request cannot talk past. **Dispatch** hands one fact to each agent, never digs, and leaves when the lake is real.

## Controls

| Action | Keyboard | Phone |
| --- | --- | --- |
| Drive the way the blade points / reverse | W / S | Stick up / down |
| Turn left / right | A / D | Stick left / right |
| Use: bind a dead Yoke, or cycle the blade (up, shelf, deep) | F | **Use** |
| Cut: drop Yoke | K | **Cut** |
| Leave (job 6 only) | L | **Leave** |

Six jobs unlock in order: Yoke, Survey, Rigger, Grade, Warden, Dispatch. Each clear ends with a question; **Next** appears only after the right answer. Progress is saved in `localStorage` under `agent009-v1`.

## What changed in v2

Every job was replayed in the browser, with the right packet and the wrong ones, on a phone and on a wide desktop. Fixes:

- **Grade** no longer fails on the first move without the shape fact. The blade lifts and drives, but only knows one depth when lowered, so the fail lands on the shelf, where the lesson is. The extra "lift" fact now earns its place: it warns before the ramp.
- **Rigger** with no tool, or with the scoop, fails at the flag with a reason instead of leaving you stuck.
- **Survey** shows the pond and the soft bank after a blind fail, so you see what you missed.
- **Every fail** marks the tile that caused it, and the fail panel sits at the bottom so the site stays visible.
- **Yoke** dead shows a banner and pulses USE. The HUD always says what F does next.
- **Camera** looks ahead and centers small sites instead of showing walls of rock. Fog follows the machine.
- **Dispatch** shows the handoff checklist (Survey → Operator → Rigger → Grade → Warden → crew parks), the working crew member waves, the crew runs at ×2 by default (tap for ×1 / ×4), and LEAVE pulses when they park.
- **Keys:** R restart, Esc jobs, Enter retry / next, 1–3 answer the check. RESTART button in the HUD. Reset progress on the jobs screen.
- Larger HUD type on big screens; phone layout keeps the log clear of the buttons.

## Run it

```bash
npm install
npm run dev     # play at http://localhost:5173
npm test        # Vitest: yoke, packets, hooks, tools, grade, the finale
npm run build   # static site in dist/
```

Deploy: `npx netlify deploy --prod --dir=dist`

## Live

https://agent0067.netlify.app

## Credit

The bulldozer metaphor is Remington Loose's, from *The Art of Network Engineering* with Andy Lapteff ("Why Network Engineers Are Built for the AI Era").
