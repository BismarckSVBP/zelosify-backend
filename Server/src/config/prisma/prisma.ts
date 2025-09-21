import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
console.log(prisma.user.fields);
export default prisma;
