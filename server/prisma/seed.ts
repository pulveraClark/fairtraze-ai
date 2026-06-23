import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // ===== AUTH USERS (create first — ClassSections need instructorId) =====
  const instructor = await prisma.user.upsert({
    where:  { email: "instructor@fairtraze.dev" },
    update: {},
    create: {
      email:        "instructor@fairtraze.dev",
      passwordHash: await bcrypt.hash("instructor123", 10),
      name:         "Demo Instructor",
      systemRole:   "INSTRUCTOR",
    },
  });
  console.log(`User: ${instructor.name} <${instructor.email}> (${instructor.systemRole})`);

  const admin = await prisma.user.upsert({
    where:  { email: "admin@fairtraze.dev" },
    update: {},
    create: {
      email:        "admin@fairtraze.dev",
      passwordHash: await bcrypt.hash("admin123", 10),
      name:         "Demo Admin",
      systemRole:   "ADMIN",
    },
  });
  console.log(`User: ${admin.name} <${admin.email}> (${admin.systemRole})`);

  // ===== CLASS SECTIONS =====
  // Migrate any rows that were seeded before EDP codes were added (LEGACY-X placeholder)
  // and update them to their real EDP codes by matching on subjectCode.
  const EDP_BY_SUBJECT: Record<string, { edpCode: string; type: "LECTURE" | "LABORATORY" }> = {
    "CC-APPSDEV22": { edpCode: "31400", type: "LECTURE" },
    "IT-IMDBSYS32": { edpCode: "21856", type: "LECTURE" },
    "IT-ELEC 2":    { edpCode: "21936", type: "LECTURE" },
    "IT-ELEC2":     { edpCode: "21936", type: "LECTURE" }, // legacy no-space variant
  };
  for (const [subjectCode, { edpCode, type }] of Object.entries(EDP_BY_SUBJECT)) {
    const legacy = await prisma.classSection.findFirst({
      where: { instructorId: instructor.id, subjectCode, edpCode: { startsWith: "LEGACY-" } },
    });
    if (legacy) {
      await prisma.classSection.update({ where: { id: legacy.id }, data: { edpCode, type } });
      console.log(`ClassSection: migrated ${subjectCode} placeholder → edpCode=${edpCode}`);
    }
  }
  // Also migrate legacy "IT-ELEC2" (no space) → "IT-ELEC 2"
  const legacyElecCode = await prisma.classSection.findFirst({
    where: { instructorId: instructor.id, subjectCode: "IT-ELEC2" },
  });
  if (legacyElecCode) {
    await prisma.classSection.update({ where: { id: legacyElecCode.id }, data: { subjectCode: "IT-ELEC 2" } });
    console.log(`ClassSection: migrated "IT-ELEC2" → "IT-ELEC 2"`);
  }

  const sectionAppsdev = await prisma.classSection.upsert({
    where:  { instructorId_edpCode: { instructorId: instructor.id, edpCode: "31400" } },
    update: { subjectCode: "CC-APPSDEV22", subjectName: "Applications Development", course: "BSIT", type: "LECTURE" },
    create: {
      subjectCode: "CC-APPSDEV22",
      subjectName: "Applications Development",
      course:      "BSIT",
      edpCode:     "31400",
      type:        "LECTURE",
      instructorId: instructor.id,
    },
  });
  console.log(`ClassSection: ${sectionAppsdev.subjectCode} edpCode=${sectionAppsdev.edpCode} (id=${sectionAppsdev.id})`);

  const sectionImdb = await prisma.classSection.upsert({
    where:  { instructorId_edpCode: { instructorId: instructor.id, edpCode: "21856" } },
    update: { subjectCode: "IT-IMDBSYS32", subjectName: "Information Management 2 (Database Systems)", course: "BSIT", type: "LECTURE" },
    create: {
      subjectCode: "IT-IMDBSYS32",
      subjectName: "Information Management 2 (Database Systems)",
      course:      "BSIT",
      edpCode:     "21856",
      type:        "LECTURE",
      instructorId: instructor.id,
    },
  });
  console.log(`ClassSection: ${sectionImdb.subjectCode} edpCode=${sectionImdb.edpCode} (id=${sectionImdb.id})`);

  const sectionElec = await prisma.classSection.upsert({
    where:  { instructorId_edpCode: { instructorId: instructor.id, edpCode: "21936" } },
    update: { subjectCode: "IT-ELEC 2", subjectName: "IT Elective 2", course: "BSIT", type: "LECTURE" },
    create: {
      subjectCode: "IT-ELEC 2",
      subjectName: "IT Elective 2",
      course:      "BSIT",
      edpCode:     "21936",
      type:        "LECTURE",
      instructorId: instructor.id,
    },
  });
  console.log(`ClassSection: ${sectionElec.subjectCode} edpCode=${sectionElec.edpCode} (id=${sectionElec.id})`);

  // ===== ASSIGNMENTS (one per class section) =====
  const assignmentAppsdev = await prisma.assignment.upsert({
    where:  { joinCode: "APPS-2026-FP" },
    update: { title: "Final Application Project", classSectionId: sectionAppsdev.id },
    create: {
      classSectionId: sectionAppsdev.id,
      title:          "Final Application Project",
      deadline:       new Date("2026-07-15T23:59:00Z"),
      maxGroupSize:   5,
      sourceType:     "GITHUB",
      joinCode:       "APPS-2026-FP",
    },
  });
  console.log(`Assignment: "${assignmentAppsdev.title}" joinCode=${assignmentAppsdev.joinCode}`);

  const assignmentImdb = await prisma.assignment.upsert({
    where:  { joinCode: "IMDB-2026-FP" },
    update: { title: "Final Application Project", classSectionId: sectionImdb.id },
    create: {
      classSectionId: sectionImdb.id,
      title:          "Final Application Project",
      deadline:       new Date("2026-07-15T23:59:00Z"),
      maxGroupSize:   5,
      sourceType:     "GITHUB",
      joinCode:       "IMDB-2026-FP",
    },
  });
  console.log(`Assignment: "${assignmentImdb.title}" joinCode=${assignmentImdb.joinCode}`);

  const assignmentElec = await prisma.assignment.upsert({
    where:  { joinCode: "ELEC-2026-FP" },
    update: { title: "Final Application Project", classSectionId: sectionElec.id },
    create: {
      classSectionId: sectionElec.id,
      title:          "Final Application Project",
      deadline:       new Date("2026-07-15T23:59:00Z"),
      maxGroupSize:   5,
      sourceType:     "GITHUB",
      joinCode:       "ELEC-2026-FP",
    },
  });
  console.log(`Assignment: "${assignmentElec.title}" joinCode=${assignmentElec.joinCode}`);

  // ===== PROJECT 1 — CC-APPSDEV22 Applications Development =====
  const project = await prisma.project.upsert({
    where: { id: 1 },
    update: { groupName: "Group 1", name: "FairTraze AI", repoUrl: "https://github.com/lenizochristian8-afk/Sysarch", assignmentLabel: "CC-APPSDEV22 — Applications Development", assignmentId: assignmentAppsdev.id },
    create: { groupName: "Group 1", name: "FairTraze AI", repoUrl: "https://github.com/lenizochristian8-afk/Sysarch", assignmentLabel: "CC-APPSDEV22 — Applications Development", assignmentId: assignmentAppsdev.id },
  });
  console.log(`Project: ${project.name} (id=${project.id}, assignmentId=${project.assignmentId})`);

  const members = await Promise.all([
    prisma.member.upsert({
      where: { id: 1 },
      update: { studentName: "John Christian Lenizo", githubUsername: "lenizochristian8-afk" },
      create: { projectId: project.id, studentName: "John Christian Lenizo", githubUsername: "lenizochristian8-afk" },
    }),
    prisma.member.upsert({
      where: { id: 2 },
      update: { studentName: "Klent Sama", githubUsername: "klentsama" },
      create: { projectId: project.id, studentName: "Klent Sama", githubUsername: "klentsama" },
    }),
    prisma.member.upsert({
      where: { id: 3 },
      update: { studentName: "Clark Edzel Pulvera", githubUsername: "pulveraClark" },
      create: { projectId: project.id, studentName: "Clark Edzel Pulvera", githubUsername: "pulveraClark" },
    }),
    prisma.member.upsert({
      where: { id: 4 },
      update: { studentName: "Kient Michael Abenoja", githubUsername: "kientmichaelabenoja-cmd" },
      create: { projectId: project.id, studentName: "Kient Michael Abenoja", githubUsername: "kientmichaelabenoja-cmd" },
    }),
    prisma.member.upsert({
      where: { id: 5 },
      update: { studentName: "Aldren Baricuatro", githubUsername: "Dren24" },
      create: { projectId: project.id, studentName: "Aldren Baricuatro", githubUsername: "Dren24" },
    }),
  ]);
  for (const m of members) {
    console.log(`  Member: ${m.studentName} (${m.githubUsername})`);
  }

  // ===== PROJECT 2 — IT-IMDBSYS32 Information Management 2 =====
  const project2 = await prisma.project.upsert({
    where: { id: 2 },
    update: { groupName: "Group 2", name: "PersonalFinanceTracker", repoUrl: "https://github.com/arcebal/PersonalFinanceTracker.git", assignmentLabel: "IT-IMDBSYS32 — Information Management 2 (Database Systems)", assignmentId: assignmentImdb.id },
    create: { groupName: "Group 2", name: "PersonalFinanceTracker", repoUrl: "https://github.com/arcebal/PersonalFinanceTracker.git", assignmentLabel: "IT-IMDBSYS32 — Information Management 2 (Database Systems)", assignmentId: assignmentImdb.id },
  });
  console.log(`Project: ${project2.name} (id=${project2.id}, assignmentId=${project2.assignmentId})`);

  const members2 = await Promise.all([
    prisma.member.upsert({
      where: { id: 6 },
      update: { studentName: "Argie Matondo", githubUsername: "Ahli-baba" },
      create: { projectId: project2.id, studentName: "Argie Matondo", githubUsername: "Ahli-baba" },
    }),
    prisma.member.upsert({
      where: { id: 7 },
      update: { studentName: "JC Ceballos", githubUsername: "arcebal" },
      create: { projectId: project2.id, studentName: "JC Ceballos", githubUsername: "arcebal" },
    }),
  ]);
  for (const m of members2) {
    console.log(`  Member: ${m.studentName} (${m.githubUsername})`);
  }

  // ===== PROJECT 3 — IT-ELEC 2 IT Elective 2 =====
  const project3 = await prisma.project.upsert({
    where: { id: 3 },
    update: { groupName: "Group 3", name: "uConnect", repoUrl: "https://github.com/eyronc/uConnect.git", assignmentLabel: "IT-ELEC 2 — IT Elective 2", assignmentId: assignmentElec.id },
    create: { groupName: "Group 3", name: "uConnect", repoUrl: "https://github.com/eyronc/uConnect.git", assignmentLabel: "IT-ELEC 2 — IT Elective 2", assignmentId: assignmentElec.id },
  });
  console.log(`Project: ${project3.name} (id=${project3.id}, assignmentId=${project3.assignmentId})`);

  const members3 = await Promise.all([
    prisma.member.upsert({
      where: { id: 8 },
      update: { studentName: "Member A", githubUsername: "eyronc" },
      create: { projectId: project3.id, studentName: "Member A", githubUsername: "eyronc" },
    }),
    prisma.member.upsert({
      where: { id: 9 },
      update: { studentName: "Member B", githubUsername: "Jadehaerys" },
      create: { projectId: project3.id, studentName: "Member B", githubUsername: "Jadehaerys" },
    }),
    prisma.member.upsert({
      where: { id: 10 },
      update: { studentName: "Member C", githubUsername: "jjnix-john" },
      create: { projectId: project3.id, studentName: "Member C", githubUsername: "jjnix-john" },
    }),
  ]);
  for (const m of members3) {
    console.log(`  Member: ${m.studentName} (${m.githubUsername})`);
  }

  // ===== PROJECT 4 — CC-APPSDEV22 Applications Development =====
  const project4 = await prisma.project.upsert({
    where: { id: 4 },
    update: { groupName: "PorkChop", name: "Porkhub", repoUrl: "https://github.com/eyronc/porkhub-ui.git", assignmentLabel: "CC-APPSDEV22 — Applications Development", assignmentId: assignmentAppsdev.id },
    create: { groupName: "PorkChop", name: "Porkhub", repoUrl: "https://github.com/eyronc/porkhub-ui.git", assignmentLabel: "CC-APPSDEV22 — Applications Development", assignmentId: assignmentAppsdev.id },
  });
  console.log(`Project: ${project4.name} (id=${project4.id}, assignmentId=${project4.assignmentId})`);

  const members4 = await Promise.all([
    prisma.member.upsert({
      where: { id: 11 },
      update: { studentName: "Member A", githubUsername: "eyronc" },
      create: { projectId: project4.id, studentName: "Member A", githubUsername: "eyronc" },
    }),
    prisma.member.upsert({
      where: { id: 12 },
      update: { studentName: "Member B", githubUsername: "iggyboi2x" },
      create: { projectId: project4.id, studentName: "Member B", githubUsername: "iggyboi2x" },
    }),
  ]);
  for (const m of members4) {
    console.log(`  Member: ${m.studentName} (${m.githubUsername})`);
  }

  // ===== PROJECT 5 — IT-IMDBSYS32 Information Management 2 =====
  const project5 = await prisma.project.upsert({
    where: { id: 5 },
    update: { groupName: "SmartBebe", name: "SkillSmart", repoUrl: "https://github.com/eyronc/SkillSmart.git", assignmentLabel: "IT-IMDBSYS32 — Information Management 2 (Database Systems)", assignmentId: assignmentImdb.id },
    create: { groupName: "SmartBebe", name: "SkillSmart", repoUrl: "https://github.com/eyronc/SkillSmart.git", assignmentLabel: "IT-IMDBSYS32 — Information Management 2 (Database Systems)", assignmentId: assignmentImdb.id },
  });
  console.log(`Project: ${project5.name} (id=${project5.id}, assignmentId=${project5.assignmentId})`);

  const members5 = await Promise.all([
    prisma.member.upsert({
      where: { id: 13 },
      update: { studentName: "Member A", githubUsername: "AynLorebelle" },
      create: { projectId: project5.id, studentName: "Member A", githubUsername: "AynLorebelle" },
    }),
    prisma.member.upsert({
      where: { id: 14 },
      update: { studentName: "Member B", githubUsername: "eyronc" },
      create: { projectId: project5.id, studentName: "Member B", githubUsername: "eyronc" },
    }),
  ]);
  for (const m of members5) {
    console.log(`  Member: ${m.studentName} (${m.githubUsername})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
