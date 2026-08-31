import fs from 'node:fs';
import path from 'node:path';
import { defaultSchedule, normalizeTimes, type IngestScheduleStored } from './ingest-schedule';

/** 自動取込スケジュールをファイルに永続化（プロセス再起動後も同じ設定・当日の実行済みスロットを保持） */
export class IngestScheduleStore {
  constructor(private readonly filePath: string) {}

  load(): IngestScheduleStored {
    const fallback = defaultSchedule();
    try {
      if (!fs.existsSync(this.filePath)) return fallback;
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<IngestScheduleStored>;
      return {
        enabled: Boolean(raw.enabled),
        times: normalizeTimes(raw.times).length ? normalizeTimes(raw.times) : fallback.times,
        lastTriggeredAt: typeof raw.lastTriggeredAt === 'string' ? raw.lastTriggeredAt : null,
        lastSlot: typeof raw.lastSlot === 'string' ? raw.lastSlot : null,
      };
    } catch {
      return fallback;
    }
  }

  save(schedule: IngestScheduleStored): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(schedule, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }
}
