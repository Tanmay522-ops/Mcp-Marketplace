/*
  Warnings:

  - You are about to drop the column `value` on the `ToolVariableValue` table. All the data in the column will be lost.
  - Added the required column `valueEncrypted` to the `ToolVariableValue` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ToolVariableValue" DROP COLUMN "value",
ADD COLUMN     "valueEncrypted" TEXT NOT NULL;
