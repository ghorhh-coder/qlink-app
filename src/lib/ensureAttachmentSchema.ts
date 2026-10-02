import { prisma } from "./prisma";
import { prismaAttachments } from "./prismaAttachments";

let schemaEnsured = false;

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT,
    "roomId" TEXT,
    "senderId" TEXT,
    "postId" TEXT,
    "kind" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "Attachment_messageId_idx" ON "Attachment"("messageId");`,
  `CREATE INDEX IF NOT EXISTS "Attachment_postId_idx" ON "Attachment"("postId");`,
  `CREATE TABLE IF NOT EXISTS "AttachmentLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attachmentId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "AttachmentLog_attachmentId_idx" ON "AttachmentLog"("attachmentId");`,
  `CREATE TABLE IF NOT EXISTS "_attachment_chunks" (
    "upload_id" TEXT NOT NULL,
    "chunk_index" INT NOT NULL,
    "data" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("upload_id", "chunk_index")
  );`,
  `CREATE INDEX IF NOT EXISTS "idx_attachment_chunks_upload_id" ON "_attachment_chunks"("upload_id");`,
];

async function applyDdl(client: any, clientName: string): Promise<boolean> {
  if (!client || typeof client.$executeRawUnsafe !== "function") return false;
  let successCount = 0;
  for (const stmt of DDL_STATEMENTS) {
    try {
      await client.$executeRawUnsafe(stmt);
      successCount++;
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("already exists")) {
        successCount++;
      } else {
        console.warn(`[ensureAttachmentSchema] DDL note on ${clientName}:`, msg);
      }
    }
  }
  return successCount > 0;
}

/**
 * Self-healing schema initializer.
 * Guarantees that "Attachment" and "AttachmentLog" tables exist in ALL PostgreSQL databases
 * (including ATTACH_DATABASE_URL and DATABASE_URL) without requiring manual migrations.
 */
export async function ensureAttachmentSchema(force = false): Promise<void> {
  if (schemaEnsured && !force) return;

  try {
    await Promise.allSettled([
      applyDdl(prismaAttachments, "prismaAttachments (ATTACH_DATABASE_URL)"),
      applyDdl(prisma, "prisma (DATABASE_URL)"),
    ]);

    schemaEnsured = true;
    console.log("[ensureAttachmentSchema] Attachment schema synchronized across all database clients.");
  } catch (err: any) {
    console.warn("[ensureAttachmentSchema] Schema synchronization warning:", err?.message || err);
  }
}
