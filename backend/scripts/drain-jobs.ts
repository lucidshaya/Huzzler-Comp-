// Runs due jobs from the database queue once, with the code on this machine.
// Production drains automatically (pg_cron -> POST /api/jobs/drain); use this when debugging a stuck job.
//   npm run jobs:drain
import { drainJobs } from "../src/jobs/queue.js";

const ran = await drainJobs(5 * 60_000);
console.log(`ran ${ran} job(s)`);
process.exit(0);
