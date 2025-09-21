import { Router, type RequestHandler } from "express";

import {
  authenticateUser,
  requireVendorRole,
} from "../../middlewares/auth/authenticateMiddleware.js";
import {
  getAllOpenings,
  getOpeningById,
  uploadSubmittedProfiles,
  viewProfiles,
  deleteProfile,
  uploadDraftedProfiles,
  uploadToAWS,
} from "../../controllers/vendor/resourceRequest/requests/getVendorRequests.js";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

import { authorizeRole } from "../../middlewares/auth/authorizeMiddleware.js";
import {
  fetchRequestData,
  // generatePresignedUrls,
  // updateVendorRequest,
  // uploadAttachment,
  // deleteAttachment,
} from "../../controllers/controllers.js";

/**
 * Router for vendor request management endpoints
 * All routes require authentication and VENDOR_MANAGER role
 */
const router = Router();

/**
 * =============================================================================
 * VENDOR RESOURCE REQUEST RETRIEVAL ROUTES
 * =============================================================================
 */

/**
 * GET /api/v1/vendor/requests
 * @requires VENDOR_MANAGER role
 */
router.get(
  "/",
  authenticateUser as RequestHandler,
  authorizeRole("VENDOR_MANAGER") as RequestHandler,
  fetchRequestData as any
);
router.get("/openings", authenticateUser, requireVendorRole, getAllOpenings);
router.get(
  "/openings/:id",
  authenticateUser,
  requireVendorRole,
  getOpeningById
);
router.post(
  "/openings/:id/profiles/presign",
  authenticateUser,
  requireVendorRole,
  upload.single("file"),
  uploadToAWS
);
router.post(
  "/openings/:id/profiles/upload",
  authenticateUser,
  requireVendorRole,
  uploadSubmittedProfiles
);
router.post(
  "/openings/:id/profiles/uploadasdraft",
  authenticateUser,
  requireVendorRole,
  uploadDraftedProfiles
);
router.post(
  "/openings/:id/profiles/view",
  authenticateUser,
  requireVendorRole,
  viewProfiles
);

// ✅ Correct delete route
router.post(
  "/openings/:openingId/profiles/delete/:profileId",
  authenticateUser,
  requireVendorRole,
  deleteProfile
);

export default router;
