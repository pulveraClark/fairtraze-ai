import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
