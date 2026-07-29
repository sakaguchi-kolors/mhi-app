export const INGEST_UPLOAD_KEYS = ['flexsche', 'pbs', 'octopus', 'shopMaster'] as const;
export type IngestUploadKey = (typeof INGEST_UPLOAD_KEYS)[number];

export function isIngestUploadKey(v: string): v is IngestUploadKey {
  return (INGEST_UPLOAD_KEYS as readonly string[]).includes(v);
}
