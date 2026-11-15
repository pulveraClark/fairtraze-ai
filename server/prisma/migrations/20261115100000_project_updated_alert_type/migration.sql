-- A group member is told when the instructor changes the project (instructions, files, deadline,
-- name, group size, scoring settings). Enum value only; no table or column changes.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'PROJECT_UPDATED';
