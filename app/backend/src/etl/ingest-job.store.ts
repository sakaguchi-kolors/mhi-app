import fs from 'node:fs';
import path from 'node:path';
import type { IngestJob } from './ingest.service';

interface StoredJobs {
  current: IngestJob | null;
  last: IngestJob | null;
}

/** 取込ジョブ状態をファイルに永続化（プロセス再起動後も直近ジョブを参照可能） */
export class IngestJobStore {
  constructor(private readonly filePath: string) {}

  load(): StoredJobs {
    try {
      if (!fs.existsSync(this.filePath)) return { current: null, last: null };
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as StoredJobs;
      return {
        current: parsed.current ?? null,
        last: parsed.last ?? null,
      };
    } catch {
      return { current: null, last: null };
    }
  }

  save(current: IngestJob | null, last: IngestJob | null): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ current, last }, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }
}
