-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AgentRunLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "step" TEXT,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentRunLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AgentRunLog" ("content", "createdAt", "id", "message", "role", "step", "taskId") SELECT "content", "createdAt", "id", "message", "role", "step", "taskId" FROM "AgentRunLog";
DROP TABLE "AgentRunLog";
ALTER TABLE "new_AgentRunLog" RENAME TO "AgentRunLog";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
