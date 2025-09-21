import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import authVendor from "../../middlewares/auth/authVendorMiddleware.js"; // ✅ updated middleware
import { getPresignedPutUrl } from "../../utils/aws/s3Downloader.js"; // ✅ AWS presign helper

const prisma = new PrismaClient();
const router = Router();

// /**
//  * 1. Fetch all openings (Tenant + Pagination + Vendor only)
//  */
router.get(
  "/openings",
  authVendor,
  async (req: any, res): Promise<void> => {
    try {
      const { page = 1, limit = 10 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const [openings, totalItems] = await Promise.all([
        prisma.opening.findMany({
          where: { tenantId: req.user.tenantId },
          skip,
          take: Number(limit),
          orderBy: { postedDate: "desc" },
          select: {
            id: true,
            title: true,
            location: true,
            contractType: true,
            postedDate: true,
            status: true,
            hiringManagerId: true,
          },
        }),
        prisma.opening.count({ where: { tenantId: req.user.tenantId } }),
      ]);

      // Fetch all managers in bulk
      const managerIds = openings.map((o) => o.hiringManagerId);
      const managers = await prisma.user.findMany({
        where: { id: { in: managerIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      const managerMap = Object.fromEntries(
        managers.map((m) => [
          m.id,
          {
            id: m.id,
            name: `${m.firstName || ""} ${m.lastName || ""}`.trim(),
            email: m.email,
          },
        ])
      );

      res.json({
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(totalItems / Number(limit)),
          totalItems,
          itemsPerPage: Number(limit),
        },
        openings: openings.map((o) => ({
          ...o,
          hiringManager: managerMap[o.hiringManagerId] || null,
        })),
      });
    } catch (err) {
      console.error("  Error fetching openings:", err);
      res.status(500).json({ error: "Failed to fetch openings" });
    }
  }
);

// /**
//  * 2. Fetch opening details (with profiles)
//  */
router.get(
  "/openings/:id",
  authVendor,
  async (req: any, res): Promise<void> => {
    try {
      const { id } = req.params;

      const opening = await prisma.opening.findFirst({
        where: { id, tenantId: req.user.tenantId },
        include: {
          hiringProfiles: {
            where: { isDeleted: false },
            select: { id: true, s3Key: true },
          },
        },
      });

      if (!opening) {
        res.status(404).json({ error: "Opening not found" });
        return;
      }

      const manager = await prisma.user.findUnique({
        where: { id: opening.hiringManagerId },
        select: { id: true, firstName: true, lastName: true, email: true },
      });

      res.json({
        id: opening.id,
        title: opening.title,
        description: opening.description,
        location: opening.location,
        contractType: opening.contractType,
        experienceMin: opening.experienceMin,
        experienceMax: opening.experienceMax,
        postedDate: opening.postedDate,
        expectedCompletionDate: opening.expectedCompletionDate,
        status: opening.status,
        hiringManager: manager
          ? {
              id: manager.id,
              name: `${manager.firstName || ""} ${
                manager.lastName || ""
              }`.trim(),
              email: manager.email,
            }
          : null,
        profilesSubmitted: opening.hiringProfiles.length,
        profiles: opening.hiringProfiles.map((p) => ({
          id: p.id,
          fileName: p.s3Key.split("_").slice(1).join("_"), // strip timestamp
        })),
      });
    } catch (err) {
      console.error("  Error fetching opening details:", err);
      res.status(500).json({ error: "Failed to fetch opening details" });
    }
  }
);

// /**
//  * 3. Generate presigned URLs for uploading profiles
//  */

router.post(
  "/openings/:id/profiles/presign",
  authVendor,
  async (req: any, res): Promise<void> => {
    try {
      const { id } = req.params;
      const { filename } = req.body;

      if (!filename || typeof filename !== "string") {
        res.status(400).json({ error: "filename is required" });
        return;
      }

      // Validate tenant ownership
      const opening = await prisma.opening.findFirst({
        where: { id, tenantId: req.user.tenantId },
      });
      if (!opening) {
        res.status(404).json({ error: "Opening not found" });
        return;
      }

      const s3Key = `${req.user.tenantId}/${id}/${Date.now()}_${filename}`;
      const url = await getPresignedPutUrl(s3Key);

      res.json({
        status: "success",
        message: "Upload token generated successfully",
        data: {
          filename,

          uploadToken: url,
          uploadEndpoint: "s3",
        },
      });
    } catch (err) {
      console.error("  Error generating presigned URL:", err);
      res.status(500).json({ error: "Failed to generate presigned URL" });
    }
  }
);
// /**
//  * 4. Submit uploaded profiles metadata
//  */

import { Request, Response, RequestHandler } from "express";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

// Extend Express Request with `user`
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    tenantId: string;
  };
}

const uploadProfiles: RequestHandler = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { id } = req.params;

    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
      res.status(400).json({ error: "At least one file is required" });
      return;
    }

    // Verify opening under correct tenant
    const opening = await prisma.opening.findFirst({
      where: { id, tenantId: req.user?.tenantId },
    });

    if (!opening) {
      res.status(404).json({ error: "Opening not found" });
      return;
    }

    const tenantId = req.user!.tenantId;

    // Insert into DB inside a transaction
    const createdProfiles = await prisma.$transaction(
      (req.files as Express.Multer.File[]).map((file) => {
        const timestamp = Date.now();
        const s3Key = `vendor-openings/${tenantId}/${id}/${timestamp}_${file.originalname}`;

        return prisma.hiringProfile.create({
          data: {
            openingId: id,
            s3Key,
            uploadedBy: req.user!.id,
          },
        });
      })
    );

    // Build response metadata
    const uploadedFiles = createdProfiles.map((profile, idx) => {
      const file = (req.files as Express.Multer.File[])[idx];
      return {
        filename: file.originalname,
        uploadedAt: new Date().toISOString(),
        status: "success",
        s3Key: profile.s3Key,
        size: file.size,
      };
    });

    res.json({
      status: "success",
      message: "Profiles uploaded successfully",
      data: {
        uploadedFiles,
        totalFiles: uploadedFiles.length,
      },
    });
  } catch (err) {
    console.error("Error saving profiles:", err);
    res
      .status(500)
      .json({ error: "Unexpected error occurred while saving profiles" });
  }
};

// Register route

router.post(
  "/openings/:id/profiles/upload",
  authVendor,
  upload.array("files"),
  uploadProfiles
);

export default router;
