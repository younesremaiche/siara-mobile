const cron = require("node-cron");

const { runWeeklySummaryJob } = require("./weeklySummaryService");

const CRON_EXPRESSION = "0 18 * * 0";
const CRON_TIMEZONE = "Africa/Algiers";

let scheduledTask = null;

function startWeeklySummaryScheduler() {
  if (scheduledTask) {
    return scheduledTask;
  }

  scheduledTask = cron.schedule(
    CRON_EXPRESSION,
    async () => {
      try {
        const result = await runWeeklySummaryJob();
        console.info("[email/weekly-summary] job_completed", {
          attemptedCount: result.attemptedCount,
          sentCount: result.sentCount,
          failedCount: result.failedCount, 
        });
      } catch (error) {
        console.error("[email/weekly-summary] job_failed", {
          message: error.message,
        });
      }
    },
    {
      scheduled: true,
      timezone: CRON_TIMEZONE,
    },
  );

  console.info("[email/weekly-summary] scheduler_started", {
    cron: CRON_EXPRESSION,
    timezone: CRON_TIMEZONE,
  });

  return scheduledTask;
}

module.exports = {
  CRON_EXPRESSION,
  CRON_TIMEZONE,
  startWeeklySummaryScheduler,
};
