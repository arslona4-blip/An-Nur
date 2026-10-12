import { sendDailySummaryIfDue } from "./lib/daily";

const DAILY_CHECK_MS = 5 * 60000;

const tick = () => sendDailySummaryIfDue().catch(() => {});
setTimeout(tick, 60000).unref();
setInterval(tick, DAILY_CHECK_MS).unref();
