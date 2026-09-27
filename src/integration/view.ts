import type { StatusView } from '../domain/types';
export const VIEW_KEY = 'initial-mastery/view';
export const DIAGNOSTICS_KEY = 'initial-mastery/diagnostics';
export type PanelSnapshot = { kb: string; view: StatusView; mode: string; generation: number; feedback?: string } | null;
