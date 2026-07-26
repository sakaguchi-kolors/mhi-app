// CP932(Shift-JIS)/UTF-8 の CSV を読み込む。
//  - readCsv      : 小さいファイル用。全行を配列で返す（従来API）。
//  - readCsvStream: 大容量ファイル用。1行ずつコールバックへ流し、定数メモリで処理する。
//    （OCTPuS工程実績は1.8GB/450万行規模になり得るため、全読み込みは
//     V8の文字列長上限(約536M文字)とヒープ上限に抵触してクラッシュする。ストリーム必須。）
//  - エンコーディングはファイルごとに自動判定する。提供データは基本CP932だが、
//    一部ファイル（例: PBS）がUTF-8で来ることがあり、固定CP932だと日本語列が全滅する。
import fs from 'node:fs';
import path from 'node:path';
import iconv from 'iconv-lite';
import { parse } from 'csv-parse/sync';
import { parse as parseStream } from 'csv-parse';

/** 値のクレンジング：Excel由来の先頭アポストロフィ・前後空白を除去 */
export function clean(v: unknown): string {
  if (v == null) return '';
  return String(v).replace(/^'+/, '').trim();
}

/** csv-parse の共通オプション（sync/stream で挙動を揃える） */
const PARSE_OPTS = {
  columns: (header: string[]) => header.map((h) => clean(h)),
  skip_empty_lines: true,
  relax_column_count: true,
  relax_quotes: true,
  bom: true,
} as const;

/**
 * ファイル先頭を覗いてエンコーディングを判定する。
 *  - BOM があればそれに従う（UTF-8 / UTF-16）
 *  - 先頭サンプルが厳格UTF-8として妥当なら UTF-8（日本語CP932はほぼ確実に不正UTF-8になる）
 *  - それ以外は CP932
 * 明示指定(override, 例: 環境変数)があれば最優先。
 */
export function detectEncoding(full: string, override?: string): string {
  if (override) return override.toLowerCase();
  const fd = fs.openSync(full, 'r');
  const buf = Buffer.alloc(1 << 20); // 1MB サンプル（先頭が偶然ASCIIでも後続の判定材料を十分に含める）
  const n = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const c = buf.subarray(0, n);
  if (c[0] === 0xef && c[1] === 0xbb && c[2] === 0xbf) return 'utf-8';
  if (c[0] === 0xff && c[1] === 0xfe) return 'utf-16le';
  if (c[0] === 0xfe && c[1] === 0xff) return 'utf-16be';
  try {
    // stream:true で末尾の途中マルチバイト（サンプル境界での截断）を不正扱いしない。
    // 中間に不正バイトがあれば fatal で throw → CP932 とみなす。
    new TextDecoder('utf-8', { fatal: true }).decode(c, { stream: true });
    return 'utf-8'; // 妥当なUTF-8（純ASCIIも含む。ASCIIはCP932と等価なので安全）
  } catch {
    return 'cp932';
  }
}

/** CSVを読み、ヘッダをキーにしたオブジェクト配列にする（小ファイル用・全読み込み） */
export function readCsv(dir: string, file: string, enc?: string): Record<string, string>[] {
  const full = path.join(dir, file);
  const encoding = detectEncoding(full, enc);
  const buf = fs.readFileSync(full);
  const text = iconv.decode(buf, encoding);
  const rows = parse(text, PARSE_OPTS) as Record<string, string>[];
  return rows;
}

/**
 * CSVをストリームで読み、1行ずつ onRow へ渡す（大容量ファイル用・定数メモリ）。
 * createReadStream → iconv デコードストリーム → csv-parse ストリーム、とパイプでつなぐ。
 * マルチバイト境界のチャンク分割は iconv-lite が内部でバッファリングして吸収する。
 * @returns 読み込んだ行数
 */
export async function readCsvStream(
  dir: string,
  file: string,
  onRow: (row: Record<string, string>) => void,
  enc?: string,
): Promise<number> {
  const full = path.join(dir, file);
  const encoding = detectEncoding(full, enc);
  let count = 0;
  const parser = fs
    .createReadStream(full)
    .pipe(iconv.decodeStream(encoding))
    .pipe(parseStream(PARSE_OPTS));
  for await (const record of parser) {
    onRow(record as Record<string, string>);
    count++;
  }
  return count;
}

/**
 * 先頭1行だけ読んでヘッダ（カラム名）と判定エンコーディングを返す（取込前プリフライト用）。
 * createReadStream は遅延読み込みのため、巨大ファイルでも先頭チャンクしか読まず高速。
 */
export function readCsvHeader(
  dir: string,
  file: string,
  enc?: string,
): Promise<{ encoding: string; columns: string[] }> {
  const full = path.join(dir, file);
  const encoding = detectEncoding(full, enc);
  return new Promise((resolve, reject) => {
    const src = fs.createReadStream(full);
    const parser = src.pipe(iconv.decodeStream(encoding)).pipe(parseStream(PARSE_OPTS));
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      src.destroy();
      fn();
    };
    parser.on('data', (row: Record<string, string>) => finish(() => resolve({ encoding, columns: Object.keys(row) })));
    parser.on('end', () => finish(() => resolve({ encoding, columns: [] })));
    parser.on('error', (e) => finish(() => reject(e)));
    src.on('error', (e) => finish(() => reject(e)));
  });
}
