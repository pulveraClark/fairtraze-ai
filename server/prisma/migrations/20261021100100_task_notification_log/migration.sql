-- Tasks board phase 6: which due-date reminders were already sent, so the hourly sweep and the lazy sweep
-- on board reads never send the same one twice. One row per (task, person, kind, due date).

-- CreateTable
CREATE TABLE "TaskNotificationLog" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskNotificationLog_taskId_userId_kind_dueDate_key" ON "TaskNotificationLog"("taskId", "userId", "kind", "dueDate");
CREATE INDEX "TaskNotificationLog_userId_idx" ON "TaskNotificationLog"("userId");

-- AddForeignKey
ALTER TABLE "TaskNotificationLog" ADD CONSTRAINT "TaskNotificationLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskNotificationLog" ADD CONSTRAINT "TaskNotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
