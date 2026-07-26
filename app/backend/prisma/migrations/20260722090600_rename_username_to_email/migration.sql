-- RenameColumn
ALTER TABLE "m_user" RENAME COLUMN "username" TO "email";

-- RenameIndex
ALTER INDEX "m_user_username_key" RENAME TO "m_user_email_key";
