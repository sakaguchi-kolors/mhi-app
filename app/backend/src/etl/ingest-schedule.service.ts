// アプリ常駐プロセス内の自動取込。指定時刻（日本時間）に CSV_DIR を取り込みます。
// Windows タスクスケジューラは不要（サービスが動いていれば動く）。
import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import type { IngestSchedule } from '../shared/types';
import { IngestService } from './ingest.service';
import {
  AUTO_INGEST_USER,
  nextRunAt,
  parseScheduleInput,
  shouldTrigger,
  slotKey,
  tokyoClock,
  type IngestScheduleStored,
} from './ingest-schedule';
import { IngestScheduleStore } from './ingest-schedule.store';

const TICK_MS = 15_000;

@Injectable()
export class IngestScheduleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('IngestSchedule');
  private readonly store: IngestScheduleStore;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly ingest: IngestService,
  ) {
    this.store = new IngestScheduleStore(this.config.ingestScheduleFile);
  }

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_MS);
    this.timer.unref?.();
    this.logger.log(`自動取込スケジューラを開始（${TICK_MS / 1000}秒間隔・日本時間）`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getPublic(): IngestSchedule {
    return this.toPublic(this.store.load());
  }

  save(body: { enabled?: unknown; times?: unknown }, user: string): IngestSchedule {
    let parsed: IngestScheduleStored;
    try {
      parsed = parseScheduleInput(body);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : String(e));
    }
    const prev = this.store.load();
    const next: IngestScheduleStored = {
      ...parsed,
      lastTriggeredAt: prev.lastTriggeredAt,
      lastSlot: prev.lastSlot,
    };
    this.store.save(next);
    this.logger.log(`スケジュール更新 by ${user}: enabled=${next.enabled} times=${next.times.join(',')}`);
    return this.toPublic(next);
  }

  /** テスト・手動確認用。通常は interval から呼ばれる。 */
  async tick(now = new Date()): Promise<boolean> {
    if (this.ticking) return false;
    this.ticking = true;
    try {
      const schedule = this.store.load();
      const clock = tokyoClock(now);
      if (!shouldTrigger({ ...schedule, now: clock })) return false;

      const slot = slotKey(clock.ymd, clock.hm);
      this.store.save({ ...schedule, lastSlot: slot, lastTriggeredAt: now.toISOString() });

      const result = await this.ingest.startIngest(AUTO_INGEST_USER);
      if (!result.started) {
        this.store.save(schedule);
        this.logger.warn(
          `自動取込をスキップ（${clock.ymd} ${clock.hm}）: ${result.reason === 'busy' ? '実行中' : 'プリフライトNG'}`,
        );
        return false;
      }
      this.logger.log(`自動取込を開始（${clock.ymd} ${clock.hm}）`);
      return true;
    } catch (e) {
      this.logger.error(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      this.ticking = false;
    }
  }

  private toPublic(stored: IngestScheduleStored): IngestSchedule {
    const clock = tokyoClock();
    return {
      enabled: stored.enabled,
      times: stored.times,
      lastTriggeredAt: stored.lastTriggeredAt,
      lastSlot: stored.lastSlot,
      nextRunAt: stored.enabled ? nextRunAt(stored.times, clock) : null,
      timezone: 'Asia/Tokyo',
    };
  }
}
