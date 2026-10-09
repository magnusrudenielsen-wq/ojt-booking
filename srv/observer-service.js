const cds = require('@sap/cds')
const { freeSlots, tz } = require('./lib/availability')
const { localToUtc, localDay, addDays, isoWeekday, toMinutes } = require('./lib/time')

/**
 * Bookable slots are 1 hour each. For the observer's own calendar, join back-to-back slots
 * that come from the same weekly rule into one entry (e.g. 12:00-15:00 instead of three boxes),
 * and remember which rule it is, so the app can offer to remove it.
 */
function mergeOpenSlots(slots, rules, dates, zone) {
  const sourceOf = s => {
    const start = new Date(s.startAt), day = localDay(start, zone)
    const minutes = Math.round((start - localToUtc(day, '00:00', zone)) / 60000)
    const inside = w => toMinutes(w.startTime) <= minutes && minutes < toMinutes(w.endTime)
    const rule = rules.find(r => r.weekday === isoWeekday(day) && inside(r))
    if (rule) return { ruleId: rule.ID, ruleStart: rule.startTime, ruleEnd: rule.endTime, key: 'r' + rule.ID }
    const date = dates.find(d => d.day === day && inside(d))
    return date ? { dateId: date.ID, key: 'd' + date.ID } : { key: '' }
  }
  const merged = []
  for (const s of slots) {
    const { key, ...source } = sourceOf(s), last = merged[merged.length - 1]
    if (last && last.endAt === s.startAt && last.key === key) { last.endAt = s.endAt; continue }
    merged.push({ startAt: s.startAt, endAt: s.endAt, key, ...source })
  }
  return merged.map(({ key, ...m }) => m)
}

module.exports = class ObserverService extends cds.ApplicationService {
  async init() {
    const { Observers, Appointments, AvailabilityExceptions, AvailabilityRules, AvailabilityDates } = cds.entities('ojt')
    const { Me, MyRules, MyExtraDays, MyBlockedTimes, MyQualifications, MyAppointments } = this.entities
    const own = [MyRules, MyExtraDays, MyBlockedTimes]
    const tableOf = { MyRules: 'ojt.AvailabilityRules', MyExtraDays: 'ojt.AvailabilityDates', MyBlockedTimes: 'ojt.AvailabilityExceptions' }

    /** The observer record of the logged-in user */
    const me = async req => {
      const o = await SELECT.one.from(Observers).where({ userId: req.user.id })
      if (!o) req.reject(403, 'You are not set up as an observer yet. Ask an OJT admin to add you.')
      return o
    }

    // Observers only ever see and change their own data
    this.before('READ', [Me, ...own, MyQualifications, MyAppointments], async req => {
      const o = await me(req)
      req.query.where(req.target === Me ? { ID: o.ID } : { observer_ID: o.ID })
    })

    this.before('CREATE', own, async req => {
      const o = await me(req)
      req.data.observer_ID = o.ID
    })

    this.before(['UPDATE', 'DELETE'], own, async req => {
      const o = await me(req)
      const table = tableOf[req.target.name.split('.').pop()]
      const row = await SELECT.one.from(table).columns('observer_ID').where({ ID: req.data.ID ?? req.params[0]?.ID ?? req.params[0] })
      if (!row || row.observer_ID !== o.ID) req.reject(404, 'Entry not found.')
    })

    this.before(['CREATE', 'UPDATE'], own, req => {
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

      const [open, booked, blocked, rules, dates] = await Promise.all([
        freeSlots({ observers: [o], fromDay: fromDate, toDay, durationMinutes: 60 }),
        SELECT.from(Appointments).where({ observer_ID: o.ID, status: 'Booked' }).and('startAt <', toUtc).and('endAt >', fromUtc),
        SELECT.from(AvailabilityExceptions).where({ observer_ID: o.ID }).and('day >=', fromDate).and('day <=', toDay),
        SELECT.from(AvailabilityRules).where({ observer_ID: o.ID }),
        SELECT.from(AvailabilityDates).where({ observer_ID: o.ID }).and('day >=', fromDate).and('day <=', toDay)
      ])
      return [
        ...mergeOpenSlots(open, rules, dates, tz()).map(s => ({ ...s, kind: 'Open', title: 'Open', text: '' })),
        ...booked.map(b => ({ startAt: b.startAt, endAt: b.endAt, kind: 'Booked', title: b.employeeName, text: b.itemTitle, appointmentId: b.ID })),
        ...blocked.map(x => ({
          startAt: localToUtc(x.day, x.startTime, tz()).toISOString(),
          endAt: localToUtc(x.day, x.endTime, tz()).toISOString(),
          kind: 'Blocked', title: x.reason || 'Blocked', text: '', blockId: x.ID
        }))
      ].sort((a, b) => a.startAt.localeCompare(b.startAt))
    })

    return super.init()
  }
}
