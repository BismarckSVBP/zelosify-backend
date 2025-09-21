import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import {
  getPresignedPutUrl,
  getPresignedGetUrl,
} from "../../../../utils/aws/s3Downloader.js";

const prisma = new PrismaClient();
import fetch from "node-fetch";

export async function fetchRequestData(req: Request, res: Response) {
  try {
    const data = "Dummy controller";
    return res.json({ message: "sucess", data });
  } catch (err: any) {
    if (err.code === "P2025") {
      // Prisma record not found
      return res.status(404).json({ message: "Data not found" });
    }
    console.error("Unknown error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * Fetch all openings (Tenant + Pagination + Vendor only)
 */
export const getAllOpenings = async (
  req: any,
  res: Response
): Promise<void> => {
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
};

/**
 * Fetch opening details (with profiles)
 */
export const getOpeningById = async (
  req: any,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const opening = await prisma.opening.findFirst({
      where: { id, tenantId: req.user.tenantId },
      include: {
        hiringProfiles: {
          where: { isDeleted: false },
          select: { id: true, s3Key: true, isDraft: true },
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
            name: `${manager.firstName || ""} ${manager.lastName || ""}`.trim(),
            email: manager.email,
          }
        : null,
      profilesSubmitted: opening.hiringProfiles.length,
      profiles: opening.hiringProfiles.map((p) => ({
        id: p.id,
        fileName: p.s3Key.split("_").slice(1).join("_"),
        s3Key: p.s3Key,
        isDraft: p.isDraft,
      })),
    });
  } catch (err) {
    console.error("  Error fetching opening details:", err);
    res.status(500).json({ error: "Failed to fetch opening details" });
  }
};

/**
 * Generate presigned URLs for uploading profiles
 */

export const uploadToAWS = async (req: any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { filename } = req.body;
    const file = req.file; // multer should provide this

    if (!file) {
      res.status(400).json({ error: "File is required" });
      return;
    }

    if (!filename || typeof filename !== "string") {
      res.status(400).json({ error: "filename is required" });
      return;
    }

    const opening = await prisma.opening.findFirst({
      where: { id, tenantId: req.user.tenantId },
    });
    if (!opening) {
      res.status(404).json({ error: "Opening not found" });
      return;
    }

    // ✅ Construct unique S3 key
    const s3Key = `${req.user.tenantId}/${id}/${Date.now()}_${filename}`;

    // ✅ Generate presigned URL
    const presignedUrl = await getPresignedPutUrl(s3Key);

    // ✅ Upload file to S3 using presigned URL
    const uploadRes = await fetch(presignedUrl, {
      method: "PUT",
      body: file.buffer, // multer stores file in buffer
      headers: { "Content-Type": file.mimetype || "application/octet-stream" },
    });

    if (!uploadRes.ok) {
      throw new Error(`S3 upload failed with status ${uploadRes.status}`);
    }

    // ✅ Respond after successful upload
    res.json({
      status: "success",
      message: "File uploaded to S3 successfully",
      data: { filename, s3Key, uploadEndpoint: "s3" },
    });
  } catch (err) {
    console.error("Error uploading file:", err);
    res.status(500).json({ error: "Failed to upload file" });
  }
};

export const uploadSubmittedProfiles = async (
  req: any,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { profiles } = req.body;

    const opening = await prisma.opening.findFirst({
      where: { id, tenantId: req.user.tenantId },
    });
    if (!opening) {
      res.status(404).json({ error: "Opening not found" });
      return;
    }

    await prisma.$transaction(
      profiles.map((p: any) =>
        prisma.hiringProfile.upsert({
          where: { s3Key: p.s3Key }, // assumes s3Key is unique
          update: {
            isDraft: false, // if already exists (drafted), just mark submitted
          },
          create: {
            openingId: id,
            s3Key: p.s3Key,
            uploadedBy: req.user.id,
            isDraft: false, // directly submitted
          },
        })
      )
    );

    res.json({
      status: "success",
      message: "Profiles submitted successfully",
    });
  } catch (err) {
    console.error("Error saving profiles:", err);
    res.status(500).json({ error: "Failed to save profiles" });
  }
};

export const uploadDraftedProfiles = async (
  req: any,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { profiles } = req.body;

    const opening = await prisma.opening.findFirst({
      where: { id, tenantId: req.user.tenantId },
    });
    if (!opening) {
      res.status(404).json({ error: "Opening not found" });
      return;
    }

    await prisma.$transaction(
      profiles.map((p: any) =>
        prisma.hiringProfile.create({
          data: {
            openingId: id,
            s3Key: p.s3Key,
            uploadedBy: req.user.id,
            isDraft: true,
          },
        })
      )
    );

    res.json({
      status: "success",
      message: "Profiles uploaded successfully",
    });
  } catch (err) {
    console.error("  Error saving profiles:", err);
    res.status(500).json({ error: "Failed to save profiles" });
  }
};

/**
 * Generate presigned view URLs
 */
export const viewProfiles = async (req: any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { profiles } = req.body;

    if (!Array.isArray(profiles) || profiles.length === 0) {
      res.status(400).json({ error: "profiles are required" });
      return;
    }

    const opening = await prisma.opening.findFirst({
      where: { id, tenantId: req.user.tenantId },
    });
    if (!opening) {
      res.status(404).json({ error: "Opening not found" });
      return;
    }

    const urls = await Promise.all(
      profiles.map(async (p: any) => {
        const url = await getPresignedGetUrl(p.s3Key, 900);
        return {
          filename: p.filename ?? p.s3Key.split("_").slice(1).join("_"),
          s3Key: p.s3Key,
          viewUrl: url,
        };
      })
    );

    res.json({
      status: "success",
      message: "Presigned view URLs generated",
      data: { profiles: urls },
    });
  } catch (err) {
    console.error("  Error generating view URLs:", err);
    res.status(500).json({ error: "Failed to generate view URLs" });
  }
};
export const deleteProfile = async (req: any, res: Response): Promise<void> => {
  try {
    const { profileId } = req.params;
    const profileIdNum = Number(profileId);

    if (isNaN(profileIdNum)) {
      void res.status(400).json({ error: "Invalid profileId" });
      return;
    }

    const profile = await prisma.hiringProfile.findUnique({
      where: { id: profileIdNum },
      include: { opening: { select: { tenantId: true } } },
    });

    if (!profile) {
      void res.status(404).json({ error: "Profile not found" });
      return;
    }

    if (String(profile.opening.tenantId) !== String(req.user.tenantId)) {
      res.status(403).json({
        error: "Forbidden: Cannot delete profile from another tenant",
      });
      return; // ✅ now the function returns void
    }

    await prisma.hiringProfile.update({
      where: { id: profileIdNum },
      data: { isDeleted: true },
    });

    void res.json({
      status: "success",
      message: "Profile deleted successfully",
    });
  } catch (err) {
    console.error("  Error deleting profile:", err);
    void res.status(500).json({ error: "Failed to delete profile" });
  }
};
