// ETL / recompute の排他制御（単一プロセス内 Mutex）
import { Injectable } from '@nestjs/common';

@Injectable()
export class BatchLockService {
  private locked = false;

  /** ロック取得。既に実行中なら false */
  acquire(): boolean {
    if (this.locked) return false;
    this.locked = true;
    return true;
  }

  release(): void {
    this.locked = false;
  }

  isLocked(): boolean {
    return this.locked;
  }
}
