const cds = require('@sap/cds')
const { freeSlots, tz } = require('./lib/availability')
const { localToUtc, addDays, toMinutes } = require('./lib/time')

module.exports = class ObserverService extends cds.ApplicationService {
  async init() {
    const { Observers, Appointments, AvailabilityExceptions } = cds.entities('ojt')
    const { Me, MyRules, MyBlockedTimes, MyQualifications, MyAppointments } = this.entities

    /** The observer record of the logged-in user */
    const me = async req => {
      const o = await SELECT.one.from(Observers).where({ userId: req.user.id })
      if (!o) req.reject(403, 'You are not set up as an observer yet. Ask an OJT admin to add you.')
      return o
    }

    // Observers only ever see and change their own data
    this.before('READ', [Me, MyRules, MyBlockedTimes, MyQualifications, MyAppointments], async req => {
      const o = await me(req)
      req.query.where(req.target === Me ? { ID: o.ID } : { observer_ID: o.ID })
    })

    this.before('CREATE', [MyRules, MyBlockedTimes], async req => {
      const o = await me(req)
      req.data.observer_ID = o.ID
    })

    this.before(['UPDATE', 'DELETE'], [MyRules, MyBlockedTimes], async req => {
      const o = await me(req)
      const table = req.target === MyRules ? 'ojt.AvailabilityRules' : 'ojt.AvailabilityExceptions'
      const row = await SELECT.one.from(table).columns('observer_ID').where({ ID: req.data.ID ?? req.params[0]?.ID ?? req.params[0] })
      if (!row || row.observer_ID !== o.ID) req.reject(404, 'Entry not found.')
    })

    this.before(['CREATE', 'UPDATE'], [MyRules, MyBlockedTimes], req => {
      const { startTime, endTime } = req.data
      if (startTime && endTime && toMinutes(startTime) >= toMinutes(endTime)) {
        req.error(400, 'The end time must be after the start time.', 'endTime')
      }
    })

    // Calendar for the SinglePlanningCalendar: open slots, bookings and blocked time
    this.on('myCalendar', async req => {
      const o = await me(req)
      const { fromDate, toDate } = req.data
      if (!fromDate || !toDate || toDate < fromDate) return req.reject(400, 'Enter a valid date range.')
      const toDay = toDate > addDays(fromDate, 62) ? addDays(fromDate, 62) : toDate
      const fromUtc = localToUtc(fromDate, '00:00', tz()).toISOString()
      const toUtc = localToUtc(addDays(toDay, 1), '00:00', tz()).toISOString()

      const [open, booked, blocked] = await Promise.all([
        freeSlots({ observers: [o], fromDay: fromDate, toDay, durationMinutes: 60 }),
        SELECT.from(Appointments).where({ observer_ID: o.ID, status: 'Booked' }).and('startAt <', toUtc).and('endAt >', fromUtc),
        SELECT.from(AvailabilityExceptions).where({ observer_ID: o.ID }).and('day >=', fromDate).and('day <=', toDay)
      ])
      return [
        ...open.map(s => ({ startAt: s.startAt, endAt: s.endAt, kind: 'Open', title: 'Open', text: '' })),
        ...booked.map(b => ({ startAt: b.startAt, endAt: b.endAt, kind: 'Booked', title: b.employeeName, text: b.itemTitle, appointmentId: b.ID })),
        ...blocked.map(x => ({
          startAt: localToUtc(x.day, x.startTime, tz()).toISOString(),
          endAt: localToUtc(x.day, x.endTime, tz()).toISOString(),
          kind: 'Blocked', title: x.reason || 'Blocked', text: ''
        }))
      ].sort((a, b) => a.startAt.localeCompare(b.startAt))
    })

    return super.init()
  }
}
