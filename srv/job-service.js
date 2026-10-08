const cds = require('@sap/cds')
const calendar = require('./lib/calendar')

module.exports = class JobService extends cds.ApplicationService {
  async init() {
    this.on('sendReminders', async () => {
      const { Appointments } = cds.entities('ojt')
      const hours = cds.env.ojt?.reminderHoursBefore ?? 24
      const now = new Date().toISOString()
      const until = new Date(Date.now() + hours * 3600e3).toISOString()
      const due = await SELECT.from(Appointments, a => { a('*'), a.observer(o => { o.name, o.email }) })
        .where({ status: 'Booked', reminderSentAt: null })
        .and('startAt >', now).and('startAt <=', until)
      for (const a of due) {
        await calendar.sendReminder({ ...a, observerName: a.observer?.name, observerEmail: a.observer?.email })
        await UPDATE(Appointments, a.ID).with({ reminderSentAt: now })
      }
      return due.length
    })
    return super.init()
  }
}
