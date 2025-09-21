// import prisma from "../config/prisma/prisma.js";

// /**
//  * Seeds the database with sample job openings for testing purposes.
//  */
// async function seedOpenings() {
//   try {
//     console.log("🌱 Seeding openings data...");

//     // Implement seeding logic (if required)
//   } catch (error) {
//     console.error("  Error seeding openings:", error);
//   } finally {
//     await prisma.$disconnect();
//   }
// }

// // Run the seed function
// seedOpenings();
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import { OpeningStatus } from "@prisma/client"; // 👈 import enum

async function seedOpenings() {
  try {
    console.log("🌱 Seeding openings data...");

    // Upsert tenant
    const tenant = await prisma.tenants.upsert({
      where: { tenantId: "avhbhnjnknjnkmkk" },
      update: {},
      create: {
        tenantId: "avhbhnjnknjnkmkk",
        companyName: "Bruce Wayne Corp",
      },
    });

    // Check if hiring manager (bismarck) exists for the tenant
    let bismarck = await prisma.user.findFirst({
      where: {
        tenantId: tenant.tenantId,
        role: "HIRING_MANAGER",
      },
    });

    // If no hiring manager is found, create a new one
    if (!bismarck) {
      throw new Error(
        "No hiring manager found for the tenant. Please create one before seeding openings."
      );
    } else {
      console.log("Found existing hiring manager:", bismarck);
    }

    // Seeding job openings with the found or created hiring manager (bismarck)
    const openings = [
      {
        title: "Data Analyst",
        location: "On-site (Manchester)",
        contractType: "3 Months",
        experienceMin: 1,
        experienceMax: 4,
        status: OpeningStatus.OPEN,
        hiringManagerId: bismarck.id,
      },
      {
        title: "UX Designer",
        location: "Remote",
        contractType: "6 Months",
        experienceMin: 2,
        experienceMax: 6,
        status: OpeningStatus.ON_HOLD,
        hiringManagerId: bismarck.id,
      },
      {
        title: "Backend Engineer",
        location: "Hybrid (London)",
        contractType: "12 Months",
        experienceMin: 3,
        experienceMax: 8,
        status: OpeningStatus.CLOSED,
        hiringManagerId: bismarck.id,
      },
      {
        title: "Frontend Developer",
        location: "On-site (Birmingham)",
        contractType: "9 Months",
        experienceMin: 2,
        experienceMax: 5,
        status: OpeningStatus.OPEN,
        hiringManagerId: bismarck.id,
      },
      {
        title: "Cloud Architect",
        location: "Remote",
        contractType: "12 Months",
        experienceMin: 5,
        experienceMax: 10,
        status: OpeningStatus.ON_HOLD,
        hiringManagerId: bismarck.id,
      },
      {
        title: "QA Engineer",
        location: "Hybrid (Leeds)",
        contractType: "6 Months",
        experienceMin: 1,
        experienceMax: 3,
        status: OpeningStatus.CLOSED,
        hiringManagerId: bismarck.id,
      },
      {
        title: "DevOps Engineer",
        location: "On-site (Liverpool)",
        contractType: "12 Months",
        experienceMin: 3,
        experienceMax: 6,
        status: OpeningStatus.OPEN,
        hiringManagerId: bismarck.id,
      },
      {
        title: "Product Manager",
        location: "Remote",
        contractType: "9 Months",
        experienceMin: 4,
        experienceMax: 9,
        status: OpeningStatus.ON_HOLD,
        hiringManagerId: bismarck.id,
      },
      {
        title: "Business Analyst",
        location: "Hybrid (London)",
        contractType: "6 Months",
        experienceMin: 2,
        experienceMax: 5,
        status: OpeningStatus.CLOSED,
        hiringManagerId: bismarck.id,
      },
      {
        title: "Security Engineer",
        location: "On-site (Manchester)",
        contractType: "12 Months",
        experienceMin: 3,
        experienceMax: 7,
        status: OpeningStatus.OPEN,
        hiringManagerId: bismarck.id,
      },
      {
        title: "UI Designer",
        location: "Remote",
        contractType: "6 Months",
        experienceMin: 1,
        experienceMax: 4,
        status: OpeningStatus.ON_HOLD,
        hiringManagerId: bismarck.id,
      },
      {
        title: "AI Researcher",
        location: "On-site (Cambridge)",
        contractType: "18 Months",
        experienceMin: 5,
        experienceMax: 12,
        status: OpeningStatus.CLOSED,
        hiringManagerId: bismarck.id,
      },
      {
        title: "Mobile Developer",
        location: "Hybrid (London)",
        contractType: "9 Months",
        experienceMin: 2,
        experienceMax: 6,
        status: OpeningStatus.OPEN,
        hiringManagerId: bismarck.id,
      },
      {
        title: "System Admin",
        location: "On-site (Leeds)",
        contractType: "6 Months",
        experienceMin: 2,
        experienceMax: 5,
        status: OpeningStatus.ON_HOLD,
        hiringManagerId: bismarck.id,
      },
      {
        title: "Blockchain Engineer",
        location: "Remote",
        contractType: "12 Months",
        experienceMin: 3,
        experienceMax: 8,
        status: OpeningStatus.CLOSED,
        hiringManagerId: bismarck.id,
      },
      {
        title: "Technical Writer",
        location: "Remote",
        contractType: "3 Months",
        experienceMin: 1,
        experienceMax: 2,
        status: OpeningStatus.OPEN,
        hiringManagerId: bismarck.id,
      },
      {
        title: "Data Scientist",
        location: "On-site (Oxford)",
        contractType: "12 Months",
        experienceMin: 4,
        experienceMax: 9,
        status: OpeningStatus.ON_HOLD,
        hiringManagerId: bismarck.id,
      },
      {
        title: "Network Engineer",
        location: "Hybrid (Bristol)",
        contractType: "9 Months",
        experienceMin: 3,
        experienceMax: 6,
        status: OpeningStatus.CLOSED,
        hiringManagerId: bismarck.id,
      },
      {
        title: "Full Stack Developer",
        location: "Remote",
        contractType: "12 Months",
        experienceMin: 3,
        experienceMax: 7,
        status: OpeningStatus.OPEN,
        hiringManagerId: bismarck.id,
      },
      {
        title: "HR Tech Specialist",
        location: "On-site (London)",
        contractType: "6 Months",
        experienceMin: 2,
        experienceMax: 5,
        status: OpeningStatus.ON_HOLD,
        hiringManagerId: bismarck.id,
      },
    ];

    await prisma.opening.createMany({
      data: openings.map((o) => ({
        tenantId: tenant.tenantId,
        title: o.title,
        description: `${o.title} role at Bruce Wayne Corp.`,
        location: o.location,
        contractType: o.contractType,
        hiringManagerId: o.hiringManagerId,
        experienceMin: o.experienceMin,
        experienceMax: o.experienceMax,
        status: o.status, // ✅ enum-safe now
      })),
      skipDuplicates: true, // Prevent duplicates if any
    });

    console.log("✅ Seed completed with openings");
  } catch (error) {
    console.error("  Error seeding openings:", error);
  } finally {
    await prisma.$disconnect();
  }
}

seedOpenings();
