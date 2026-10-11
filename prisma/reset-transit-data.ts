/**
 * Borra rutas, paradas, unidades e incidencias para partir de cero.
 * No toca los usuarios administrativos. Uso: npm run db:reset
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.incident.deleteMany();
  await prisma.routeStop.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.stop.deleteMany();
  await prisma.route.deleteMany();
  console.log("Datos de rutas, paradas, unidades e incidencias eliminados.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
