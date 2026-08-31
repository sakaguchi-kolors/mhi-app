import type { Part } from '../types';
import { PartsList } from './PartsList';

interface Props {
  parts: Part[];
  owners: string[];
  stagnantThreshold?: number;
  admin?: boolean;
  meDisplayName?: string;
  myKishus?: string[];
  defaultOwnerFilter?: string;
  onAutoAssign?: () => void;
  onOpen: (id: string) => void;
  onOwner: (id: string, owner: string) => void;
  onTrouble: (id: string, flagged: boolean) => void;
  onShelved: (id: string, flagged: boolean) => void;
  onWatch: (id: string, flagged: boolean) => void;
  onMemo: (id: string, memo: string) => void;
}

/** 要ウォッチ部品専用一覧（部品一覧と同じ列構成） */
export function WatchDashboard(props: Props) {
  return (
    <PartsList
      {...props}
      watchOnly
      hideShelvedToggle
    />
  );
}
