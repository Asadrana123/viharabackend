// jobs/signupDoctorJob.js
//
// Sign-up doctor schedule (IST), only when SIGNUP_DOCTOR_ENABLED=true:
//   07:45 daily   find ad landing pages with visitors but few sign-ups, and
//                 post the AI's likely reasons to Slack
// Run it any time from Slack with /adsloop why [page link].

const cron = require("node-cron");
const { getConversionConfig, missingConversionSettings } = require("../config/conversion/conversionConfig");
const { runSignupDoctor } = require("../services/conversion/conversionService");

function startSignupDoctorJob() {
    const config = getConversionConfig();
    if (!config.enabled) {
        console.log("[signup-doctor] SIGNUP_DOCTOR_ENABLED is not true; daily diagnosis is off.");
        return;
    }
    const missing = missingConversionSettings(config);
    if (missing.length) console.warn(`[signup-doctor] missing settings: ${missing.join(", ")}`);

    cron.schedule(
        config.schedule,
        () => runSignupDoctor().catch((e) => console.error("[signup-doctor] run failed:", e.message)),
        { timezone: config.scheduleTimeZone }
    );
    console.log("[signup-doctor] scheduled: daily 07:45 IST.");
}

module.exports = { startSignupDoctorJob };
