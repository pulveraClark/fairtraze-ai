-- Alert.instructorId became optional in 20261008100100_notif_recipient; align the
-- FK's delete rule with Prisma's default for an optional relation (SET NULL) so
-- deleting an instructor no longer RESTRICTs on their legacy alerts.
ALTER TABLE "Alert" DROP CONSTRAINT "Alert_instructorId_fkey";
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
