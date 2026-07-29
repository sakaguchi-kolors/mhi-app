import { classifyPartByRegex } from '../shared/domain';
import type { MasterContext } from '../masters/masters.util';
import { clean } from './csv';

export function deriveCategory(partNo: string, m: MasterContext): string {
  return classifyPartByRegex(clean(partNo), m.categoryRules);
}
