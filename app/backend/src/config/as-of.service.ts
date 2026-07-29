// データ基準日（AS_OF）: 取込完了日を DB に保存し、算出・表示の単一の源とする。
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from './app-config.service';
import { isYmd, localYmd, ymdToDate } from '../shared/dates';

export const AS_OF_PARAM_KEY = 'AS_OF';
const AS_OF_DESCRIPTION = 'データ基準日（最終取込日・自動更新）';

@Injectable()
export class AsOfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /** 取込 ETL 開始時: 実行日を基準日として採用 */
  forIngest(): { ymd: string; date: Date } {
    const ymd = localYmd();
    return { ymd, date: ymdToDate(ymd) };
  }

  /** DB 保存値 → env AS_OF（開発用）→ 今日 */
  async getEffective(): Promise<string> {
    const stored = await this.getStored();
    if (stored) return stored;
    const env = this.config.asOfEnv;
    if (env) return env;
    return localYmd();
  }

  async getEffectiveDate(): Promise<Date> {
    return ymdToDate(await this.getEffective());
  }

  /** 取込成功時に m_param へ永続化 */
  async persist(ymd: string, user = 'etl'): Promise<void> {
    if (!isYmd(ymd)) throw new Error(`invalid AS_OF: ${ymd}`);
    await this.prisma.param.upsert({
      where: { key: AS_OF_PARAM_KEY },
      create: {
        key: AS_OF_PARAM_KEY,
        value: ymd,
        description: AS_OF_DESCRIPTION,
        createdBy: user,
        updatedBy: user,
      },
      update: { value: ymd, updatedBy: user },
    });
  }

  private async getStored(): Promise<string | null> {
    const row = await this.prisma.param.findUnique({
      where: { key: AS_OF_PARAM_KEY },
      select: { value: true },
    });
    const v = row?.value?.trim();
    return v && isYmd(v) ? v : null;
  }
}
