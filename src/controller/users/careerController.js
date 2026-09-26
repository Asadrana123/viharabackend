// src/controller/careerController.js
const CareerApplication = require("../../model/users/careerModel");
const sendEmail = require("../../utils/sendEmail");
const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");
const careerApplicantEmail = require("../../htmlPages/users/careerApplicantEmail");
const careerAdminNotificationEmail = require("../../htmlPages/users/careerAdminNotificationEmail");
const careerMarketingAssignmentEmail = require("../../htmlPages/users/careerMarketingAssignmentEmail");
const careerVideoEditorAssignmentEmail = require("../../htmlPages/users/careerVideoEditorAssignmentEmail");
const path = require("path");
const { ROLE_LABELS } = require("../../config/careerRoles");

// ─── Constants ───────────────────────────────────────────────────────────────
// Marketing Manager applicants get the take-home assignment instead of the
// generic confirmation email.
const MARKETING_ASSIGNMENT_PDF = path.join(
  __dirname,
  "../../assets/careers/Vihara-Marketing-Manager-Assignment.pdf"
);

// ─── Submit application (public) ────────────────────────────────────────────
exports.submitApplication = catchAsyncError(async (req, res, next) => {
  const {
    role,
    firstName,
    lastName,
    email,
    phone,
    linkedinUrl,
    portfolioUrl,
    resumeLink,
    technicalSkills,
    mernAndFigmaRating,
    proudProject,
    freeTimeLearning,
    admirePerson,
    worldClassSkill,
    controversialOpinion,
    currentExpectedCTC,
    availableImmediately,
    comfortableSchedule,
    joinImmediately,
    successfulCampaign,
    creativeGrowthStrategy,
  } = req.body;

  if (!ROLE_LABELS[role]) {
    return next(new Errorhandler("Invalid role specified", 400));
  }

  const application = await CareerApplication.create({
    role,
    firstName,
    lastName,
    email,
    phone,
    linkedinUrl,
    portfolioUrl,
    resumeLink,
    technicalSkills: technicalSkills || "",
    mernAndFigmaRating: mernAndFigmaRating || "",
    proudProject,
    freeTimeLearning,
    admirePerson,
    worldClassSkill,
    controversialOpinion,
    currentExpectedCTC,
    availableImmediately,
    comfortableSchedule,
    joinImmediately,
    successfulCampaign: successfulCampaign || "",
    creativeGrowthStrategy: creativeGrowthStrategy || "",
  });

  const roleLabel = ROLE_LABELS[role];

  // Confirmation to applicant (Marketing Manager and Video Editor get their
  // assignment instead)
  if (role === "video-editor") {
    sendEmail(
      email,
      firstName,
      "Vihara Video Editor, Test Assignment",
      careerVideoEditorAssignmentEmail(firstName)
    );
  } else if (role === "marketing-manager") {
    sendEmail(
      email,
      firstName,
      "Vihara Marketing Manager - Your Assignment",
      careerMarketingAssignmentEmail(firstName),
      [
        {
          filename: "Vihara - Marketing Manager Assignment.pdf",
          path: MARKETING_ASSIGNMENT_PDF,
          contentType: "application/pdf",
        },
      ]
    );
  } else {
    sendEmail(
      email,
      firstName,
      `Application Received — ${roleLabel} at Vihara`,
      careerApplicantEmail(firstName, roleLabel)
    );
  }

  // Notification to admin
  sendEmail(
    process.env.ADMIN_EMAIL || "vin@vihara.ai",
    "Admin",
    `New Application: ${roleLabel} — ${firstName} ${lastName}`,
    careerAdminNotificationEmail(application, roleLabel)
  );

  res.status(201).json({
    success: true,
    message: "Application submitted successfully",
  });
});

// ─── Get all applications (admin) ───────────────────────────────────────────
exports.getAllApplications = catchAsyncError(async (req, res, next) => {
  const { role, status, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);

  const [applications, total] = await Promise.all([
    CareerApplication.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CareerApplication.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    total,
    page: Number(page),
    applications,
  });
});

// ─── Get single application (admin) ─────────────────────────────────────────
exports.getApplication = catchAsyncError(async (req, res, next) => {
  const application = await CareerApplication.findById(req.params.id);
  if (!application) {
    return next(new Errorhandler("Application not found", 404));
  }
  res.status(200).json({ success: true, application });
});

// ─── Update application status (admin) ──────────────────────────────────────
exports.updateApplicationStatus = catchAsyncError(async (req, res, next) => {
  const { status, adminNotes } = req.body;

  const application = await CareerApplication.findByIdAndUpdate(
    req.params.id,
    { status, adminNotes },
    { new: true, runValidators: true }
  );

  if (!application) {
    return next(new Errorhandler("Application not found", 404));
  }

  res.status(200).json({ success: true, application });
});
