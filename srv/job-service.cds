/** Called by SAP BTP Job Scheduling, for example every hour. */
@requires: 'JobScheduler'
service JobService @(path: '/odata/v4/jobs') {
  /** Sends reminders for bookings that start within cds.ojt.reminderHoursBefore. Returns the count sent. */
  action sendReminders() returns Integer;
}
