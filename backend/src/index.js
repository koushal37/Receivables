import { app } from './app.js';
import { initDailyJobs } from './engine/dailyJobs.js';

// Initialize Cron Jobs
initDailyJobs();

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Receivables backend running on port ${PORT}`);
});
