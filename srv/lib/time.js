/**
 * Small time-zone helpers (no extra libraries).
 * Availability is maintained in local wall-clock time; appointments are stored in UTC.
 */

function tzOffsetMs(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date)
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]))
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** 'YYYY-MM-DD' + 'HH:MM[:SS]' in time zone tz -> Date (UTC instant) */
function localToUtc(day, time, tz) {
  const [y, m, d] = day.split('-').map(Number)
  const [hh, mm, ss = 0] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss)
  let ts = guess - tzOffsetMs(new Date(guess), tz)
  ts = guess - tzOffsetMs(new Date(ts), tz) // second pass handles DST boundaries
  return new Date(ts)
}

/** The local calendar day ('YYYY-MM-DD') of an instant in time zone tz */
function localDay(date, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 1 = Monday ... 7 = Sunday */
function isoWeekday(day) {
  const w = new Date(day + 'T00:00:00Z').getUTCDay()
  return w === 0 ? 7 : w
}

const toMinutes = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const fromMinutes = min => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0')

module.exports = { localToUtc, localDay, addDays, isoWeekday, toMinutes, fromMinutes }
