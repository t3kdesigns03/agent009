// After a clear, make them answer.
import type { JobId } from './levels';

export interface Choice {
  text: string;
  why: string;
  right: boolean;
}

export interface Check {
  ask: string;
  choices: Choice[];
}

export const CHECKS: Record<JobId, Check> = {
  yoke: {
    ask: 'The machine would not move. Why?',
    choices: [
      {
        text: 'It needed a bigger engine.',
        why: 'Bigger is not the point. The machine was already strong. The controls were dead.',
        right: false,
      },
      {
        text: 'The wheel was off.',
        why: 'Right. The yellow machine is the brain. It is strong. It still sat there until you turned the wheel on. That wheel is Yoke. No wheel, no work.',
        right: true,
      },
      {
        text: 'The lake was already finished.',
        why: 'Nothing was dug yet. It could not even roll.',
        right: false,
      },
    ],
  },
  survey: {
    ask: 'Why did the pond stop the dig?',
    choices: [
      {
        text: 'You needed the long book about dirt.',
        why: 'That book was noise. Survey only needed the pond and the soft mud.',
        right: false,
      },
      {
        text: 'The pond was already a lake.',
        why: 'Right. Look before you dig. Two facts. Not a library.',
        right: true,
      },
      {
        text: 'The machine ran out of gas.',
        why: 'It had power. It did not know the ground.',
        right: false,
      },
    ],
  },
  rigger: {
    ask: 'The scoop could not finish the cut. Why?',
    choices: [
      {
        text: 'A scoop is just a weaker blade.',
        why: 'It is a different tool. A scoop lifts. This hole needs a push.',
        right: false,
      },
      {
        text: 'The wrong tool was on the front.',
        why: 'Right. A bulldozer pushes dirt. It does not scoop it up.',
        right: true,
      },
      {
        text: 'You drove too slowly.',
        why: 'Speed was fine. The iron on the front could not push dirt out.',
        right: false,
      },
    ],
  },
  grade: {
    ask: 'You had a blade and still got stuck. Why?',
    choices: [
      {
        text: 'The blade was too small.',
        why: 'The blade was the right tool. It was used at one depth the whole way.',
        right: false,
      },
      {
        text: 'You forgot when to lift it.',
        why: 'Right. Owning a blade is not knowing how to dig. Deep in the middle. Shallow on the edge. Lift it to drive out.',
        right: true,
      },
      {
        text: 'Yoke turned itself off.',
        why: 'Yoke was on. The hole had no way out.',
        right: false,
      },
    ],
  },
  warden: {
    ask: 'What actually stopped the machine at the fence?',
    choices: [
      {
        text: 'A sign that said please.',
        why: 'Please is a request. The machine can ignore a request.',
        right: false,
      },
      {
        text: 'A lock, not a request.',
        why: 'Right. A hook is a lock. The fence stopped the dozer. It did not get a vote.',
        right: true,
      },
      {
        text: 'The crew shouted stop.',
        why: 'Shouting is still a request. The hook did not ask.',
        right: false,
      },
    ],
  },
  dispatch: {
    ask: 'Who finished the lake?',
    choices: [
      {
        text: 'You dug the whole thing.',
        why: 'You picked the facts and left. The crew did the jobs.',
        right: false,
      },
      {
        text: 'Five workers. One fact each.',
        why: 'Right. You did not drive this one. Then you left. They finished the lake.',
        right: true,
      },
      {
        text: 'The machine decided by itself.',
        why: 'A machine with no assignment just sits. Someone had to hand out the jobs.',
        right: false,
      },
    ],
  },
};
