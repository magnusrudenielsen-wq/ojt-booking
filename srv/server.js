const cds = require('@sap/cds')
const { localDay, addDays, isoWeekday, localToUtc } = require('./lib/time')

/**
 * Local development only:
 *  1. The UI5 apps use relative OData URLs ("odata/v4/..."), as required for
 *     SAP Build Work Zone / the HTML5 Application Repository. When `cds watch`
 *     serves the apps from /<app>/webapp/, rewrite those calls to /odata/v4/...
 *  2. Seed a few bookings relative to today, so the observer calendar isn't empty.
 */
cds.on('bootstrap', app => {
  app.use((req, _res, next) => {
    const m = req.url.match(/^\/[\w-]+\/webapp(\/odata\/.*)$/)
    if (m) req.url = m[1]
    next()
  })
})

cds.on('served', async () => {
  if (cds.env.profiles?.includes('production') || process.env.OJT_NO_DEMO_DATA) return
  const { Appointments, AvailabilityExceptions } = cds.entities('ojt')
  if (await SELECT.one.from(Appointments)) return
  const tz = cds.env.ojt?.timezone || 'Europe/Copenhagen'
  const nextWeekday = (wd, after = 1) => {
    let d = addDays(localDay(new Date(), tz), after)
    while (isoWeekday(d) !== wd) d = addDays(d, 1)
    return d
  }
  const mette = '6f1c1c4e-1a0b-4e57-9f0e-0a1b2c3d4e01'
  const lars = '6f1c1c4e-1a0b-4e57-9f0e-0a1b2c3d4e02'
  const tue = nextWeekday(2, 2), wed = nextWeekday(3, 2), thu = nextWeekday(4, 2)
  const at = (day, t) => localToUtc(day, t, tz).toISOString()
  await INSERT.into(Appointments).entries([
    {
      employeeId: 'anna', employeeName: 'Anna Lund', employeeEmail: 'anna.lund@example.com',
      observer_ID: mette, itemId: 'OJT-RAMP-012', itemTitle: 'Pushback with towbar',
      startAt: at(tue, '09:00'), endAt: at(tue, '10:00'), location: 'Ramp office B4, then stand B12',
      status: 'Booked', calendarEventId: 'demo-seed-1'
    },
    {
      employeeId: 'anna', employeeName: 'Anna Lund', employeeEmail: 'anna.lund@example.com',
      observer_ID: lars, itemId: 'OJT-DEICE-002', itemTitle: 'De-icing observation',
      startAt: at(wed, '08:00'), endAt: at(wed, '09:30'), location: 'De-icing pad East',
      status: 'Booked', calendarEventId: 'demo-seed-2'
    }
  ])
  await INSERT.into(AvailabilityExceptions).entries({
    observer_ID: mette, day: thu, startTime: '10:00:00', endTime: '12:00:00', reason: 'Recurrent training'
  })
})

module.exports = cds.server
