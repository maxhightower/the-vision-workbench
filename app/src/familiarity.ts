import type { Familiarity } from './types';

export const FAMILIARITIES: Familiarity[] = ['known', 'somewhat', 'unfamiliar', 'unknown'];

export const FAM_COLOR: Record<Familiarity, string> = {
  known: 'var(--fam-known)',
  somewhat: 'var(--fam-somewhat)',
  unfamiliar: 'var(--fam-unfamiliar)',
  unknown: 'var(--fam-unknown)',
};
