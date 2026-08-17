import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HeatmapService } from './heatmap.service';
import { parseHeatCellQuery, parseHeatmapQuery } from './heatmap.query';
import type { HeatCellDetail, HeatmapResult, PartCongestion } from '../shared/types';

const DEFAULT_WEEKS = 12;

@Controller('heatmap')
@ApiTags('heatmap')
@ApiCookieAuth('mhi_token')
export class HeatmapController {
  constructor(private readonly heatmap: HeatmapService) {}

  @Get()
  @ApiOperation({ summary: '工程ヒートマップ（SHOP×期間の部品件数と混雑水準）' })
  get(@Query() q: Record<string, string | undefined>): Promise<HeatmapResult> {
    return this.heatmap.getHeatmap(parseHeatmapQuery(q, DEFAULT_WEEKS));
  }

  @Get('cell')
  @ApiOperation({ summary: 'ヒートマップ1セルの内訳（該当部品を優先度順に返す）' })
  cell(@Query() q: Record<string, string | undefined>): Promise<HeatCellDetail> {
    return this.heatmap.getCell(parseHeatCellQuery(q));
  }

  @Get('part/:id')
  @ApiOperation({ summary: '部品詳細：後続SHOPの着手数・色内訳・バッティング候補' })
  part(@Param('id') id: string): Promise<PartCongestion> {
    return this.heatmap.getPartCongestion(id);
  }
}
