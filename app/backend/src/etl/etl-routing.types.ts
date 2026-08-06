// ETL内部で扱う工程行（1工程＝1行）
export interface RoutingRow {
  osId: string;
  seqMain: number;
  seqSub: number;
  seqLabel: string;
  shop: string;
  job: string;
  planStart: Date | null;
  planEnd: Date | null;
  actualEnd: Date | null;
  wip: boolean;
  materialStatus: string;
  outDate: Date | null;
  inDate: Date | null;
  etaDate: Date | null;
  reqDueDate: Date | null;
  orderNo: string;
}
