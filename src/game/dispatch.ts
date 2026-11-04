import { AGENT_NAME, AGENT_ORDER, CARDS, isNoise, type AgentId, type CardId } from './cards';

export const MAX_FACTS = 2;

export type Assignment =
  | { ok: true; agent: AgentId; cards: CardId[] }
  | { ok: false; agent: AgentId; reason: string };

/** Hand one agent its facts. Two at most. Noise never passes. */
export function assignAgent(agent: AgentId, cards: CardId[]): Assignment {
  if (cards.length > MAX_FACTS) {
    return { ok: false, agent, reason: 'Too much context.' };
  }
  for (const id of cards) {
    const card = CARDS[id];
    if (!card) return { ok: false, agent, reason: `Unknown card: ${id}.` };
    if (isNoise(id)) return { ok: false, agent, reason: `Noise. ${card.text}` };
    if (card.agent !== agent) {
      return { ok: false, agent, reason: `Not ${AGENT_NAME[agent]}’s fact.` };
    }
  }
  return { ok: true, agent, cards: [...cards] };
}

export interface Step {
  agent: AgentId;
  card: CardId;
  log: string;
}

export type Orchestration = { ok: true; steps: Step[] } | { ok: false; reason: string };

export type Packet = Partial<Record<AgentId, CardId[]>>;

/**
 * Dispatch. One fact per agent, five agents, fixed order.
 * Returns the steps, or the reason it will not start. It never digs.
 */
export function orchestrate(packet: Packet): Orchestration {
  const steps: Step[] = [];
  for (const agent of AGENT_ORDER) {
    const name = AGENT_NAME[agent];
    const cards = packet[agent] ?? [];
    if (cards.length === 0) {
      return { ok: false, reason: `Missing ${name}. ${name} has no fact.` };
    }
    const a = assignAgent(agent, cards);
    if (!a.ok) return { ok: false, reason: `${name}: ${a.reason}` };
    if (cards.length !== 1) {
      return { ok: false, reason: `${name}: one fact per agent in the finale.` };
    }
    const card = cards[0];
    steps.push({ agent, card, log: `DISPATCH → ${name.toUpperCase()}: ${CARDS[card].short}.` });
  }
  return { ok: true, steps };
}
