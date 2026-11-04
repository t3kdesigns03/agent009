// One vocabulary. One term per thing, the same in the scene, the HUD, the briefs, the debriefs and the quizzes.

export type BlockId = 'model' | 'tools' | 'context' | 'plan' | 'guardrails' | 'orchestrator' | 'harness';

export interface Block {
  id: BlockId;
  name: string;
  scene: string;
  agent: string;
}

/** The agent stack, bottom to top. The harness wraps all of it. */
export const BLOCKS: Block[] = [
  {
    id: 'model',
    name: 'Model',
    scene: 'The yellow machine. Strong. A bigger machine is a bigger model.',
    agent: 'The LLM that decides the next step. It can’t act on anything by itself.',
  },
  {
    id: 'tools',
    name: 'Tools',
    scene: 'The yoke (the link to the tracks and steering) and the iron on the front: blade, bucket or ripper.',
    agent: 'Tool binding and tool calls: the functions an agent can invoke, and picking the right one.',
  },
  {
    id: 'context',
    name: 'Context',
    scene: 'Scans of the ground, written into a context packet of three slots.',
    agent: 'Perception and grounding, then the small set of facts you put in the context window.',
  },
  {
    id: 'plan',
    name: 'Plan',
    scene: 'The work order: which cells, at what depth, in what order. Graded before anyone drives.',
    agent: 'Steps worked out from the goal and checked against constraints before acting.',
  },
  {
    id: 'guardrails',
    name: 'Guardrails',
    scene: 'A hook on the fence. A hard stop that a polite request can’t talk past.',
    agent: 'Rules the harness enforces before a tool call runs, whatever the model was told.',
  },
  {
    id: 'orchestrator',
    name: 'Orchestrator',
    scene: 'Dispatch: four machines, one job each, handing results to each other.',
    agent: 'An agent that hands tasks to worker agents, passes results along, and merges the outcome.',
  },
  {
    id: 'harness',
    name: 'Harness',
    scene: 'The loop that runs every machine on the site, step after step.',
    agent: 'The runtime that calls the model, runs its tools, checks its guardrails, and loops.',
  },
];

export const BLOCK: Record<BlockId, Block> = Object.fromEntries(BLOCKS.map((b) => [b.id, b])) as Record<
  BlockId,
  Block
>;

export type Stage = 'perceive' | 'plan' | 'act' | 'observe' | 'check' | 'handoff';

/** The harness loop. Context and memory are carried across every turn of it. */
export const HARNESS: { id: Stage; name: string; scene: string }[] = [
  { id: 'perceive', name: 'Perceive', scene: 'scan the ground' },
  { id: 'plan', name: 'Plan', scene: 'read the work order, pick the next step' },
  { id: 'act', name: 'Act', scene: 'a tool call: bind, mount, lower, drive' },
  { id: 'observe', name: 'Observe', scene: 'see what the cut actually did' },
  { id: 'check', name: 'Check', scene: 'guardrails: may this next move happen?' },
  { id: 'handoff', name: 'Repeat / hand off', scene: 'next step, or pass the result on' },
];

export const STAGE_NAME: Record<Stage, string> = Object.fromEntries(HARNESS.map((s) => [s.id, s.name])) as Record<
  Stage,
  string
>;

/** The glossary shown on the landing page and from the HUD. */
export const GLOSSARY: { term: string; scene: string; agent: string }[] = [
  { term: 'Machine', scene: 'The yellow bulldozer.', agent: 'The model.' },
  {
    term: 'Yoke',
    scene: 'The link from the cab to the tracks and steering. Cyan when bound.',
    agent: 'Tool binding. While it’s bound, a decision becomes a tool call.',
  },
  {
    term: 'Dead belt',
    scene: 'A dead strip across the haul road. Crossing it drops the yoke.',
    agent: 'A dropped tool connection, like an expired session or a lost tool server.',
  },
  {
    term: 'Cut (K)',
    scene: 'You cut the yoke on purpose. Drawn red.',
    agent: 'The operator’s kill switch: revoking the binding.',
  },
  { term: 'Scan (F)', scene: 'A pulse that shows what’s under the ground nearby.', agent: 'Perception: reading the real environment.' },
  {
    term: 'Existing water',
    scene: 'Water that’s already there. Blue, with a white shoreline. Never enter it.',
    agent: 'Something that already exists and must not be damaged, like production data.',
  },
  {
    term: 'Soft bank',
    scene:
      'Waterlogged ground in front of existing water. It looks firm from above, but a machine sinks into it and rolls.',
    agent: 'A hazard you only know about if you perceived it. Assuming it isn’t there is how agents fail.',
  },
  {
    term: 'Context packet',
    scene: 'Three slots of facts that travel with the machine to the next job.',
    agent: 'The context window: the few facts the agent is given for the next step.',
  },
  {
    term: 'Tool rack',
    scene: 'Bays on the rigging pad: blade (pushes), bucket (lifts), ripper (breaks).',
    agent: 'The agent’s tool list. Mounting one is a tool call.',
  },
  {
    term: 'Shelf · Deep',
    scene: 'Shelf = one step down (the lake’s shallow ring). Deep = two steps down (the middle).',
    agent: 'The outputs the plan asks for.',
  },
  {
    term: 'Work order',
    scene: 'The checklist on screen: what to do, where, in what order.',
    agent: 'The plan.',
  },
  {
    term: 'Hook',
    scene: 'A shield on the fence. Rule W1 blocks the move before it happens.',
    agent: 'A guardrail enforced by the harness. A request can’t override it.',
  },
  {
    term: 'Request',
    scene: 'A polite sign or radio message: “please stay off the fence”.',
    agent: 'An instruction in the prompt. A newer, more specific request can outrank it.',
  },
  {
    term: 'Orchestrator',
    scene: 'You, in Job 6: you assign the machines and never touch a lever.',
    agent: 'The agent that delegates to worker agents and merges their results.',
  },
  {
    term: 'Handoff',
    scene: 'A packet flying from one machine to another: “hazard map”, “spoil ready”.',
    agent: 'One agent’s result passed on as another agent’s context.',
  },
  {
    term: 'Harness',
    scene: 'The loop drawn on every HUD: perceive → plan → act → observe → check → repeat.',
    agent: 'The runtime that runs the agent loop and carries memory between steps.',
  },
];

export const WHO = {
  you: 'You are the operator. You run the agent: you give it a binding, facts, a tool, a plan and rules.',
  it: 'The agent is the whole yellow stack: machine (model), yoke and iron (tools), packet (context), work order (plan) and hook (guardrails), all run by the harness loop.',
  arc: 'In Jobs 1–3 you drive by hand, so you feel each block. In Job 4 you write and grade the plan, and the agent can drive it. In Job 5 you pick the rule, then test it against a polite request. In Job 6 you are the Orchestrator: you dispatch four agents and never touch a lever.',
};
