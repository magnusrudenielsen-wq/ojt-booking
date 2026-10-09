const { localToUtc, addDays, isoWeekday, toMinutes, fromMinutes } = require('./time')

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd

/**
 * Free slots for ONE observer. Pure function, no database access, so it is easy to test.
 *
 * Free = weekly availability rules, plus one-off available dates
 *        minus blocked time
 *        minus busy intervals (existing bookings, Outlook busy time)
 *        minus anything starting before `notBefore`.
 *
 * @param {object} o
 * @param {{weekday:number,startTime:string,endTime:string}[]} o.rules  local times
 * @param {{day:string,startTime:string,endTime:string}[]} [o.dates] one-off available dates, local times
 * @param {{day:string,startTime:string,endTime:string}[]} [o.blocked] local times
 * @param {{startAt:string|Date,endAt:string|Date}[]} [o.busy] UTC instants
 * @param {string} o.fromDay 'YYYY-MM-DD' (local)
 * @param {string} o.toDay   'YYYY-MM-DD' (local, inclusive)
 * @param {number} o.durationMinutes
 * @param {string} o.tz IANA time zone, e.g. 'Europe/Copenhagen'
 * @param {Date} [o.notBefore]
 * @returns {{startAt:string,endAt:string}[]} UTC ISO strings, sorted
 */
function freeSlotsFor({ rules, dates = [], blocked = [], busy = [], fromDay, toDay, durationMinutes, tz, notBefore }) {
  const taken = [
    ...busy.map(b => [new Date(b.startAt).getTime(), new Date(b.endAt).getTime()]),
    ...blocked.map(x => [localToUtc(x.day, x.startTime, tz).getTime(), localToUtc(x.day, x.endTime, tz).getTime()])
  ]
  const seen = new Set()
  const result = []
  let guard = 0
  for (let day = fromDay; day <= toDay && guard++ < 120; day = addDays(day, 1)) {
    const weekday = isoWeekday(day)
    const windows = [...rules.filter(r => r.weekday === weekday), ...dates.filter(d => d.day === day)]
    for (const rule of windows) {
      const end = toMinutes(rule.endTime)
      for (let t = toMinutes(rule.startTime); t + durationMinutes <= end; t += durationMinutes) {
        const start = localToUtc(day, fromMinutes(t), tz)
        const stop = localToUtc(day, fromMinutes(t + durationMinutes), tz)
        if (notBefore && start < notBefore) continue
        if (taken.some(([s, e]) => overlaps(start.getTime(), stop.getTime(), s, e))) continue
        const key = start.toISOString()
        if (seen.has(key)) continue
        seen.add(key)
        result.push({ startAt: key, endAt: stop.toISOString() })
      }
    }
  }
  return result.sort((a, b) => a.startAt.localeCompare(b.startAt))
}

module.exports = { freeSlotsFor, overlaps }
