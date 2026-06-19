import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ===== PROJECT 1 (existing) =====
  const project = await prisma.project.upsert({
    where: { id: 1 },
    update: { name: "FairTraze AI", repoUrl: "https://github.com/lenizochristian8-afk/Sysarch" },
    create: { name: "FairTraze AI", repoUrl: "https://github.com/lenizochristian8-afk/Sysarch" },
  });
  console.log(`Project: ${project.name} (id=${project.id})`);

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

  // ===== PROJECT 2 ===== //
  const project2 = await prisma.project.upsert({
    where: { id: 2 },
    update: { name: "PersonalFinanceTracker", repoUrl: "https://github.com/arcebal/PersonalFinanceTracker.git" },
    create: { name: "PersonalFinanceTracker", repoUrl: "https://github.com/arcebal/PersonalFinanceTracker.git" },
  });
  console.log(`Project: ${project2.name} (id=${project2.id})`);

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

  // ===== PROJECT 3 ===== //
  const project3 = await prisma.project.upsert({
    where: { id: 3 },
    update: { name: "uConnect", repoUrl: "https://github.com/eyronc/uConnect.git" },
    create: { name: "uConnect", repoUrl: "https://github.com/eyronc/uConnect.git" },
  });
  console.log(`Project: ${project3.name} (id=${project3.id})`);

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());