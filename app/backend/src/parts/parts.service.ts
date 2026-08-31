// 部品一覧の組み立て（②算出結果 ＋ ③アプリ固有 ＋ 外注先名）と、アプリ固有データの更新。
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AsOfService } from '../config/as-of.service';
import { AuditService } from '../audit/audit.service';
import type { JwtUser } from '../auth/jwt-auth.guard';
import type { Part, TimelineCell, Color, CellStatus, GaicStatus, GaicPhase } from '../common/types';
import { mmdd, ymd, daysSince } from '../shared/dates';

const MAX_TEXT_LEN = 2000;

type TimelineRow = {
  osId: string;
  shop: string | null;
  name: string | null;
  status: string | null;
  planEnd: Date | null;
  isMilestone: boolean;
  msPassed: boolean | null;
  msColor: string | null;
  msDue: Date | null;
  msBehind: number | null;
  gaic: boolean;
  gaicStatus: string | null;
  gaicPhase: string | null;
  outDate: Date | null;
  inDate: Date | null;
  etaDate: Date | null;
  reqDueDate: Date | null;
  orderNo: string | null;
};

type PartsCache = {
  computedAt: Date | null;
  summaries: Part[];
  timelines: Record<string, TimelineCell[]> | null;
};

@Injectable()
export class PartsService {
  private partsCache: PartsCache | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly asOf: AsOfService,
    private readonly audit: AuditService,
  ) {}

  clearCache(): void {
    this.partsCache = null;
  }

  private afterMutation(): void {
    this.clearCache();
  }

  /** 一覧向け（タイムラインなし・軽量） */
  async buildPartsSummary(): Promise<Part[]> {
    const computedAt = await this.loadComputedAt();
    const cached = this.partsCache;
    if (cached && cached.computedAt?.getTime() === computedAt?.getTime() && cached.summaries.length) {
      return cached.summaries;
    }
    const summaries = await this.assembleSummaries(computedAt);
    const keepTimelines =
      cached && cached.computedAt?.getTime() === computedAt?.getTime() ? cached.timelines : null;
    this.partsCache = { computedAt, summaries, timelines: keepTimelines };
    return summaries;
  }

  /** 指定部品のタイムラインのみ（進捗バー用・ページ単位取得） */
  async buildTimelinesForIds(ids: string[]): Promise<Record<string, TimelineCell[]>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return {};
    return this.assembleTimelines(unique);
  }

  /** 全件タイムライン（後方互換・ETL等） */
  async buildTimelines(): Promise<Record<string, TimelineCell[]>> {
    const computedAt = await this.loadComputedAt();
    const cached = this.partsCache;
    if (cached && cached.computedAt?.getTime() === computedAt?.getTime() && cached.timelines) {
      return cached.timelines;
    }
    const timelines = await this.assembleTimelines();
    if (cached && cached.computedAt?.getTime() === computedAt?.getTime()) {
      this.partsCache = { computedAt: cached.computedAt, summaries: cached.summaries, timelines };
    } else {
      this.partsCache = { computedAt, summaries: cached?.summaries ?? [], timelines };
    }
    return timelines;
  }

  /** 一覧＋タイムライン（後方互換・ETL 等） */
  async buildParts(): Promise<Part[]> {
    const summaries = await this.buildPartsSummary();
    const timelines = await this.buildTimelines();
    return summaries.map((p) => ({ ...p, timeline: timelines[p.id] ?? [] }));
  }

  private async loadComputedAt(): Promise<Date | null> {
    const latest = await this.prisma.partStatus.aggregate({ _max: { computedAt: true } });
    return latest._max.computedAt ?? null;
  }

  private async assembleSummaries(computedAt: Date | null): Promise<Part[]> {
    const asOf = await this.asOf.getEffectiveDate();
    const [status, assign, trouble, shelved, watch, note] = await Promise.all([
      this.prisma.partStatus.findMany(),
      this.prisma.assignment.findMany({
        select: { osId: true, userId: true, assignedAt: true, user: { select: { displayName: true } } },
      }),
      this.prisma.trouble.findMany({ select: { osId: true, flagged: true, flaggedAt: true, memo: true } }),
      this.prisma.shelved.findMany({ select: { osId: true, flagged: true } }),
      this.prisma.watch.findMany({ select: { osId: true, flagged: true } }),
      this.prisma.note.findMany({ select: { osId: true, body: true } }),
    ]);

    const aMap = new Map(assign.map((r) => [r.osId, r]));
    const tMap = new Map(trouble.map((r) => [r.osId, r]));
    const sMap = new Map(shelved.map((r) => [r.osId, r]));
    const wMap = new Map(watch.map((r) => [r.osId, r]));
    const nMap = new Map(note.map((r) => [r.osId, r]));

    return status.map((s): Part => {
      const a = aMap.get(s.osId);
      const t = tMap.get(s.osId);
      const sh = sMap.get(s.osId);
      const w = wMap.get(s.osId);
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
        shortage: false,
        currentShop: s.currentShop ?? '',
        timeline: [],
        inst: String(s.osId).replace(/\D/g, '').slice(-4),
        owner,
        ownerDays: owner === '未割当' ? null : daysSince(a?.assignedAt ?? null, asOf),
        trouble: t?.flagged ?? false,
        troubleDays: t?.flagged ? daysSince(t?.flaggedAt ?? null, asOf) : null,
        memo: t?.memo ?? '',
        note: nMap.get(s.osId)?.body ?? '',
        shelved: sh?.flagged ?? false,
        watch: w?.flagged ?? false,
      };
    });
  }

  private async assembleTimelines(osIds?: string[]): Promise<Record<string, TimelineCell[]>> {
    const [timeline, vendor] = await Promise.all([
      this.prisma.timeline.findMany({
        where: osIds?.length ? { osId: { in: osIds } } : undefined,
        orderBy: [{ osId: 'asc' }, { seq: 'asc' }],
      }),
      this.prisma.vendor.findMany({ where: { active: true }, select: { orderPrefix: true, vendorName: true } }),
    ]);
    const vendorOf = buildVendorLookup(vendor);
    const tlByOs = new Map<string, TimelineCell[]>();
    for (const r of timeline as TimelineRow[]) {
      const cell = toTimelineCell(r, vendorOf);
      if (!tlByOs.has(r.osId)) tlByOs.set(r.osId, []);
      tlByOs.get(r.osId)!.push(cell);
    }
    return Object.fromEntries(tlByOs);
  }

  async setOwner(
    actor: JwtUser,
    auditUser: string,
    osId: string,
    input: { owner?: string; userId?: number },
  ): Promise<void> {
    await this.assertPartExists(osId);
    const before = await this.snapshotPartApp(osId);
    let userId: number | null = null;

    if (input.userId != null) {
      const u = await this.prisma.user.findUnique({ where: { userId: input.userId } });
      if (!u || !u.active) throw new BadRequestException('指定された担当者が見つかりません');
      if (u.role === '管理者') throw new BadRequestException('管理者は担当者に割り当てできません');
      userId = u.userId;
    } else {
      const ownerName = input.owner ?? '未割当';
      if (ownerName !== '未割当') {
        const matches = await this.prisma.user.findMany({ where: { displayName: ownerName, active: true } });
        if (matches.length === 0) {
          throw new BadRequestException(`担当者「${ownerName}」が見つかりません（担当者画面で登録してください）`);
        }
        if (matches.length > 1) {
          throw new BadRequestException(`担当者「${ownerName}」が複数存在します。userIdを指定してください`);
        }
        if (matches[0].role === '管理者') throw new BadRequestException('管理者は担当者に割り当てできません');
        userId = matches[0].userId;
      }
    }

    await this.assertOwnerPermission(actor, osId, userId);

    const assignedAt = userId ? new Date() : null;
    await this.prisma.assignment.upsert({
      where: { osId },
      update: { userId, assignedAt },
      create: { osId, userId, assignedAt },
    });
    const after = await this.snapshotPartApp(osId);
    await this.audit.record(auditUser, 'part.owner', 't_assignment', osId, before, after);
    this.afterMutation();
  }

  private async assertOwnerPermission(actor: JwtUser, osId: string, targetUserId: number | null): Promise<void> {
    if (actor.role === '管理者') return;

    const cur = await this.prisma.assignment.findUnique({
      where: { osId },
      include: { user: { select: { userId: true, displayName: true } } },
    });
    const currentOwner = cur?.user?.displayName ?? '未割当';
    const currentUserId = cur?.userId ?? null;
    const targetIsUnassigned = targetUserId == null;

    if (currentOwner !== '未割当' && currentUserId !== actor.sub) {
      throw new ForbiddenException('他人の担当は変更できません');
    }
    if (currentUserId === actor.sub && targetIsUnassigned) {
      throw new ForbiddenException('自分の担当を未割当にはできません');
    }
    if (currentOwner === '未割当' && !targetIsUnassigned && targetUserId !== actor.sub) {
      throw new ForbiddenException('未割当の部品は自分にのみ割り当てできます');
    }
  }

  async setTrouble(user: string, osId: string, flagged: boolean): Promise<void> {
    await this.assertPartExists(osId);
    const before = await this.snapshotPartApp(osId);
    const flaggedAt = flagged ? new Date() : null;
    await this.prisma.trouble.upsert({
      where: { osId },
      update: { flagged, flaggedAt },
      create: { osId, flagged, flaggedAt },
    });
    const after = await this.snapshotPartApp(osId);
    await this.audit.record(user, 'part.trouble', 't_trouble', osId, before, after);
    this.afterMutation();
  }

  async setShelved(user: string, osId: string, flagged: boolean): Promise<void> {
    await this.assertPartExists(osId);
    const before = await this.snapshotPartApp(osId);
    const flaggedAt = flagged ? new Date() : null;
    await this.prisma.shelved.upsert({
      where: { osId },
      update: { flagged, flaggedAt },
      create: { osId, flagged, flaggedAt },
    });
    const after = await this.snapshotPartApp(osId);
    await this.audit.record(user, 'part.shelved', 't_shelved', osId, before, after);
    this.afterMutation();
  }

  async setWatch(user: string, osId: string, flagged: boolean): Promise<void> {
    await this.assertPartExists(osId);
    const before = await this.snapshotPartApp(osId);
    const flaggedAt = flagged ? new Date() : null;
    await this.prisma.watch.upsert({
      where: { osId },
      update: { flagged, flaggedAt },
      create: { osId, flagged, flaggedAt },
    });
    const after = await this.snapshotPartApp(osId);
    await this.audit.record(user, 'part.watch', 't_watch', osId, before, after);
    this.afterMutation();
  }

  async setMemo(user: string, osId: string, memo: string): Promise<void> {
    if (memo.length > MAX_TEXT_LEN) throw new BadRequestException(`メモは${MAX_TEXT_LEN}文字以内にしてください`);
    await this.assertPartExists(osId);
    const before = await this.snapshotPartApp(osId);
    await this.prisma.trouble.upsert({
      where: { osId },
      update: { memo },
      create: { osId, memo },
    });
    const after = await this.snapshotPartApp(osId);
    await this.audit.record(user, 'part.memo', 't_trouble', osId, before, after);
    this.afterMutation();
  }

  async setNote(user: string, osId: string, body: string): Promise<void> {
    if (body.length > MAX_TEXT_LEN) throw new BadRequestException(`対応メモは${MAX_TEXT_LEN}文字以内にしてください`);
    await this.assertPartExists(osId);
    const before = await this.snapshotPartApp(osId);
    await this.prisma.note.upsert({
      where: { osId },
      update: { body, updatedAt: new Date() },
      create: { osId, body, updatedAt: new Date() },
    });
    const after = await this.snapshotPartApp(osId);
    await this.audit.record(user, 'part.note', 't_note', osId, before, after);
    this.afterMutation();
  }

  private async assertPartExists(osId: string): Promise<void> {
    const exists = await this.prisma.partStatus.findUnique({ where: { osId }, select: { osId: true } });
    if (!exists) throw new NotFoundException(`部品 ${osId} が見つかりません`);
  }

  /** 監査用：③アプリ固有データのスナップショット */
  private async snapshotPartApp(osId: string): Promise<Record<string, unknown> | null> {
    const [a, t, s, w, n] = await Promise.all([
      this.prisma.assignment.findUnique({ where: { osId }, include: { user: { select: { displayName: true } } } }),
      this.prisma.trouble.findUnique({ where: { osId } }),
      this.prisma.shelved.findUnique({ where: { osId } }),
      this.prisma.watch.findUnique({ where: { osId } }),
      this.prisma.note.findUnique({ where: { osId } }),
    ]);
    if (!a && !t && !s && !w && !n) return null;
    return {
      owner: a?.user?.displayName ?? '未割当',
      trouble: t?.flagged ?? false,
      memo: t?.memo ?? '',
      shelved: s?.flagged ?? false,
      watch: w?.flagged ?? false,
      note: n?.body ?? '',
    };
  }
}

function buildVendorLookup(vendor: { orderPrefix: string; vendorName: string }[]) {
  const vendors = vendor
    .map((r) => ({ prefix: String(r.orderPrefix), name: String(r.vendorName) }))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  return (order?: string | null): string | undefined => {
    if (!order) return undefined;
    return vendors.find((v) => order.startsWith(v.prefix))?.name;
  };
}

function toTimelineCell(r: TimelineRow, vendorOf: (order?: string | null) => string | undefined): TimelineCell {
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
      if (r.msBehind != null) cell.msBehind = r.msBehind;
    }
  }
  if (r.gaic) {
    cell.gaic = true;
    cell.gorder = r.orderNo ?? undefined;
    cell.gstat = (r.gaicStatus ?? undefined) as GaicStatus | undefined;
    cell.gphase = (r.gaicPhase ?? undefined) as GaicPhase | undefined;
    cell.gout = mmdd(r.outDate);
    cell.gin = mmdd(r.inDate);
    cell.geta = mmdd(r.etaDate);
    cell.greq = mmdd(r.reqDueDate);
    cell.gvendor = vendorOf(r.orderNo);
  }
  return cell;
}
