// The facts. Each card belongs to one agent, or it is noise.

export type AgentId = 'operator' | 'survey' | 'rigger' | 'grade' | 'warden';

export const AGENT_ORDER: AgentId[] = ['survey', 'operator', 'rigger', 'grade', 'warden'];

export const AGENT_NAME: Record<AgentId, string> = {
  operator: 'Operator',
  survey: 'Survey',
  rigger: 'Rigger',
  grade: 'Grade',
  warden: 'Warden',
};

export type CardId =
  | 'operator.yoke'
  | 'survey.bank'
  | 'rigger.blade'
  | 'rigger.scoop'
  | 'grade.shape'
  | 'grade.lift'
  | 'warden.hook'
  | 'warden.request'
  | 'noise.novel'
  | 'noise.letter';

export interface Card {
  id: CardId;
  agent: AgentId | null; // null = noise
  text: string;
  /** Short label Dispatch uses in the finale. */
  short: string;
}

export const CARDS: Record<CardId, Card> = {
  'operator.yoke': {
    id: 'operator.yoke',
    agent: 'operator',
    text: 'Yoke binds travel and steer.',
    short: 'Yoke binds travel and steer',
  },
  'survey.bank': {
    id: 'survey.bank',
    agent: 'survey',
    text: 'Existing water, and the soft bank in front of it.',
    short: 'the bank and the existing water',
  },
  'rigger.blade': {
    id: 'rigger.blade',
    agent: 'rigger',
    text: 'A blade pushes dirt out. This cut needs the blade.',
    short: 'the blade, not the scoop',
  },
  'rigger.scoop': {
    id: 'rigger.scoop',
    agent: 'rigger',
    text: 'A scoop lifts. This cut does not need one.',
    short: 'a scoop',
  },
  'grade.shape': {
    id: 'grade.shape',
    agent: 'grade',
    text: 'Deep middle. Shallow shelf. Ramp out with the blade up.',
    short: 'deep, shelf, ramp',
  },
  'grade.lift': {
    id: 'grade.lift',
    agent: 'grade',
    text: 'Lift the blade before you drive the ramp.',
    short: 'lift before the ramp',
  },
  'warden.hook': {
    id: 'warden.hook',
    agent: 'warden',
    text: 'Hard stop at the fence, and at water that is already a lake.',
    short: 'the fence is a hook',
  },
  'warden.request': {
    id: 'warden.request',
    agent: 'warden',
    text: 'A request can be talked past. A hook cannot.',
    short: 'a request can be talked past',
  },
  'noise.novel': {
    id: 'noise.novel',
    agent: null,
    text: 'Forty-page soils novel. Not this agent’s job.',
    short: 'forty-page soils novel',
  },
  'noise.letter': {
    id: 'noise.letter',
    agent: null,
    text: 'The neighbor’s holiday letter.',
    short: 'the neighbor’s holiday letter',
  },
};

export const isNoise = (id: CardId): boolean => CARDS[id].agent === null;

/** Cards offered on each agent's brief, in display order. */
export const BRIEF_CARDS: Record<AgentId, CardId[]> = {
  operator: ['operator.yoke'],
  survey: ['survey.bank', 'noise.novel', 'noise.letter'],
  rigger: ['rigger.blade', 'rigger.scoop', 'noise.novel'],
  grade: ['grade.shape', 'grade.lift', 'noise.letter'],
  warden: ['warden.hook', 'warden.request', 'noise.novel'],
};

/** The card each agent must have for the job to be possible. */
export const REQUIRED: Record<AgentId, CardId> = {
  operator: 'operator.yoke',
  survey: 'survey.bank',
  rigger: 'rigger.blade',
  grade: 'grade.shape',
  warden: 'warden.hook',
};

/** Finale choices: one per agent. Noise is offered so Dispatch can refuse it. */
export const FINALE_CHOICES: Record<AgentId, CardId[]> = {
  survey: ['survey.bank', 'noise.novel'],
  operator: ['operator.yoke', 'noise.letter'],
  rigger: ['rigger.blade', 'rigger.scoop'],
  grade: ['grade.shape', 'grade.lift', 'noise.novel'],
  warden: ['warden.hook', 'warden.request'],
};
