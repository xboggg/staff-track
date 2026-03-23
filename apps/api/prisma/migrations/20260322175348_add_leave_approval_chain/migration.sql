-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "current_level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "rejected_at" TIMESTAMP(3),
ADD COLUMN     "rejected_by" TEXT;

-- CreateTable
CREATE TABLE "leave_approvals" (
    "id" TEXT NOT NULL,
    "leave_request_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "level_name" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approver_id" TEXT,
    "comments" TEXT,
    "acted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_approvals_leave_request_id_idx" ON "leave_approvals"("leave_request_id");

-- CreateIndex
CREATE INDEX "leave_approvals_approver_id_idx" ON "leave_approvals"("approver_id");

-- CreateIndex
CREATE INDEX "leave_approvals_status_idx" ON "leave_approvals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "leave_approvals_leave_request_id_level_key" ON "leave_approvals"("leave_request_id", "level");

-- AddForeignKey
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approvals_leave_request_id_fkey" FOREIGN KEY ("leave_request_id") REFERENCES "leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approvals_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
