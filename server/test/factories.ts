import bcrypt from "bcryptjs";
import type { SystemRole } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { signToken } from "../src/lib/jwt.js";

let emailCounter = 0;
let joinCodeCounter = 0;

export async function createUser(overrides: {
  email?: string;
  password?: string;
  name?: string;
  systemRole?: SystemRole;
  active?: boolean;
  emailVerified?: boolean;
} = {}) {
  emailCounter += 1;
  const password = overrides.password ?? "password123";
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? `user${emailCounter}@example.com`,
      passwordHash,
      name: overrides.name ?? `Test User ${emailCounter}`,
      systemRole: overrides.systemRole ?? "INSTRUCTOR",
      active: overrides.active ?? true,
      ...(overrides.emailVerified !== undefined ? { emailVerified: overrides.emailVerified } : {}),
    },
  });
  return { user, password };
}

export function authHeaderFor(user: { id: number; email: string; name: string; systemRole: SystemRole }) {
  const token = signToken({ sub: user.id, email: user.email, name: user.name, role: user.systemRole });
  return `Bearer ${token}`;
}

// afterEach truncates every table between tests (see setupEnv.ts), so this must be
// re-upserted (not cached) each call — a cached id would go stale the moment the
// Department row it points at gets wiped.
async function getDefaultTestDepartmentId(): Promise<number> {
  const department = await prisma.department.upsert({
    where:  { id: 1 },
    update: {},
    create: { name: "Test Department", code: "TEST" },
  });
  return department.id;
}

export async function createClassSection(instructorId: number, overrides: { subjectCode?: string; departmentId?: number } = {}) {
  joinCodeCounter += 1;
  const departmentId = overrides.departmentId ?? (await getDefaultTestDepartmentId());
  return prisma.classSection.create({
    data: {
      instructorId,
      subjectCode: overrides.subjectCode ?? "CC-TEST",
      subjectName: "Test Subject",
      departmentId,
      edpCode: `EDP${joinCodeCounter}`,
    },
  });
}

export async function createAssignment(
  classSectionId: number,
  overrides: { title?: string; sourceType?: "GITHUB" | "EDITOR" | "COMBINED" } = {}
) {
  joinCodeCounter += 1;
  return prisma.assignment.create({
    data: {
      classSectionId,
      title: overrides.title ?? "Test Assignment",
      sourceType: overrides.sourceType ?? "GITHUB",
      joinCode: `JOIN${joinCodeCounter}`,
    },
  });
}

export async function createProject(overrides: { assignmentId?: number | null; groupName?: string } = {}) {
  return prisma.project.create({
    data: {
      groupName: overrides.groupName ?? "Test Group",
      name: "Test Project",
      repoUrl: "https://github.com/example/repo",
      assignmentId: overrides.assignmentId ?? null,
    },
  });
}

export async function createMembership(userId: number, projectId: number, role: "LEADER" | "MEMBER" = "MEMBER") {
  return prisma.groupMembership.create({ data: { userId, projectId, role } });
}
