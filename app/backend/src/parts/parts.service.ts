// 部品一覧の組み立て（②算出結果 ＋ ③アプリ固有 ＋ 外注先名）と、アプリ固有データの更新。
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import type { Part, TimelineCell, Color, CellStatus, GaicStatus } from '../common/types';

function mmdd(d: Date | null): string | undefined {
  if (!d) return undefined;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
function ymd(d: Date | null): string {
  if (!d) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
function daysSince(from: Date | null, asOf: Date): number | null {
  if (!from) return null;
  const a = Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const b = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.max(0, Math.round((a - b) / 86400000));
}

@Injectable()
export class PartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async buildParts(): Promise<Part[]> {
    const asOf = this.config.asOfDate;
    const [status, timeline, assign, trouble, shelved, note, vendor] = await Promise.all([
      this.prisma.partStatus.findMany(),
      this.prisma.timeline.findMany({ orderBy: [{ osId: 'asc' }, { seq: 'asc' }] }),
      this.prisma.assignment.findMany({
        select: { osId: true, userId: true, assignedAt: true, user: { select: { displayName: true } } },
      }),
      this.prisma.trouble.findMany({ select: { osId: true, flagged: true, flaggedAt: true, memo: true } }),
      this.prisma.shelved.findMany({ select: { osId: true, flagged: true } }),
      this.prisma.note.findMany({ select: { osId: true, body: true } }),
      this.prisma.vendor.findMany({ where: { active: true }, select: { orderPrefix: true, vendorName: true } }),
    ]);

    // 外注先名の解決（注文番号の前方一致・長いprefix優先）
    const vendors = vendor
      .map((r) => ({ prefix: String(r.orderPrefix), name: String(r.vendorName) }))
      .sort((a, b) => b.prefix.length - a.prefix.length);
    const vendorOf = (order?: string | null): string | undefined => {
      if (!order) return undefined;
      return vendors.find((v) => order.startsWith(v.prefix))?.name;
    };

    const tlByOs = new Map<string, TimelineCell[]>();
    for (const r of timeline) {
      const cell: TimelineCell = {
        shop: r.shop ?? '',
        name: r.name ?? '',
        status: (r.status ?? 'wait') as CellStatus,
        plan: mmdd(r.planEnd),
      };
      if (r.isMilestone) {
        cell.milestone = true;
        cell.mpassed = r.msPassed ?? false;
        if (!cell.mpassed) {
          cell.mcolor = (r.msColor ?? undefined) as Color | undefined;
          cell.mdue = mmdd(r.msDue);
        }
      }
      if (r.gaic) {
        cell.gaic = true;
        cell.gorder = r.orderNo ?? undefined;
        cell.gstat = (r.gaicStatus ?? undefined) as GaicStatus | undefined;
        cell.gvendor = vendorOf(r.orderNo);
      }
      if (!tlByOs.has(r.osId)) tlByOs.set(r.osId, []);
      tlByOs.get(r.osId)!.push(cell);
    }

    const aMap = new Map(assign.map((r) => [r.osId, r]));
    const tMap = new Map(trouble.map((r) => [r.osId, r]));
    const sMap = new Map(shelved.map((r) => [r.osId, r]));
    const nMap = new Map(note.map((r) => [r.osId, r]));

    return status.map((s): Part => {
      const a = aMap.get(s.osId);
      const t = tMap.get(s.osId);
      const sh = sMap.get(s.osId);
      const owner = a?.user?.displayName ?? '未割当';
      return {
        id: s.osId,
        partNo: s.partNo ?? '',
        name: s.partName ?? '',
        category: s.category ?? '',
        kishu: s.kishu ?? '',
        finalDue: ymd(s.finalDue),
        daysLeft: s.daysLeft ?? 0,
        totalShops: s.totalShops ?? 0,
        doneShops: s.doneShops ?? 0,
        remainShops: s.remainShops ?? 0,
        buffer: s.buffer ?? 0,
        color: (s.color ?? 'green') as Color,
        stagnant: s.stagnantDays ?? 0,
        urgent: s.urgent ?? false,
        shortage: s.shortage ?? false,
        currentShop: s.currentShop ?? '',
        timeline: tlByOs.get(s.osId) ?? [],
        inst: String(s.osId).replace(/\D/g, '').slice(-4),
        owner,
        ownerDays: owner === '未割当' ? null : daysSince(a?.assignedAt ?? null, asOf),
        trouble: t?.flagged ?? false,
        troubleDays: t?.flagged ? daysSince(t?.flaggedAt ?? null, asOf) : null,
        memo: t?.memo ?? '',
        note: nMap.get(s.osId)?.body ?? '',
        shelved: sh?.flagged ?? false,
      };
    });
  }

  async setOwner(osId: string, ownerName: string): Promise<void> {
    let userId: number | null = null;
    if (ownerName !== '未割当') {
      const u = await this.prisma.user.findFirst({ where: { displayName: ownerName, active: true } });
      if (!u) throw new BadRequestException(`担当者「${ownerName}」が見つかりません（ユーザー管理で登録してください）`);
      if (u.role === '管理者') throw new BadRequestException('管理者は担当者に割り当てできません');
      userId = u.userId;
    }
    const assignedAt = userId ? new Date() : null;
    await this.prisma.assignment.upsert({
      where: { osId },
      update: { userId, assignedAt },
      create: { osId, userId, assignedAt },
    });
  }

  async setTrouble(osId: string, flagged: boolean): Promise<void> {
    const flaggedAt = flagged ? new Date() : null;
    await this.prisma.trouble.upsert({
      where: { osId },
      update: { flagged, flaggedAt },
      create: { osId, flagged, flaggedAt },
    });
  }

  async setShelved(osId: string, flagged: boolean): Promise<void> {
    const flaggedAt = flagged ? new Date() : null;
    await this.prisma.shelved.upsert({
      where: { osId },
      update: { flagged, flaggedAt },
      create: { osId, flagged, flaggedAt },
    });
  }

  async setMemo(osId: string, memo: string): Promise<void> {
    await this.prisma.trouble.upsert({
      where: { osId },
      update: { memo },
      create: { osId, memo },
    });
  }

  async setNote(osId: string, body: string): Promise<void> {
    await this.prisma.note.upsert({
      where: { osId },
      update: { body, updatedAt: new Date() },
      create: { osId, body, updatedAt: new Date() },
    });
  }
}
