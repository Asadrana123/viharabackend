// src/config/careerRoles.js
// Single source of truth for the Careers roles on the backend.
// Keep the ids in sync with JOBS in the frontend's components/Careers/careersData.js.

const ROLE_LABELS = {
  "senior-software-engineer": "Senior Software Engineer",
  "product-manager": "Product Manager",
  "ui-ux-designer": "UI/UX Designer",
  "marketing-manager": "Marketing Manager",
  "motion-graphics-designer": "Motion Graphics Designer",
  "growth-manager": "Growth Manager",
  "senior-product-manager": "Senior Product Manager",
  "business-development-manager": "Business Development Manager",
  "forward-deployed-engineer": "Forward Deployed Engineer",
  "engineering-manager": "Engineering Manager",
  "video-editor": "Video Editor",
};

// Roles that are NOT asked the technicalSkills / mernAndFigmaRating questions
const NON_TECHNICAL_ROLES = [
  "marketing-manager",
  "growth-manager",
  "business-development-manager",
  "video-editor",
];

// Roles that are asked the successfulCampaign / creativeGrowthStrategy questions
const MARKETING_ROLES = ["marketing-manager", "growth-manager"];

// Roles where a portfolio link is required
const PORTFOLIO_REQUIRED_ROLES = ["video-editor"];

const isTechnicalRole = (role) => !NON_TECHNICAL_ROLES.includes(role);
const isMarketingRole = (role) => MARKETING_ROLES.includes(role);
const isPortfolioRequired = (role) => PORTFOLIO_REQUIRED_ROLES.includes(role);

module.exports = {
  ROLE_LABELS,
  NON_TECHNICAL_ROLES,
  MARKETING_ROLES,
  PORTFOLIO_REQUIRED_ROLES,
  isTechnicalRole,
  isMarketingRole,
  isPortfolioRequired,
};
