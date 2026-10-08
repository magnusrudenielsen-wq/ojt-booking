const cds = require('@sap/cds')
const { freeSlotsFor } = require('./slots')
const { localToUtc, addDays } = require('./time')
const calendar = require('./calendar')

const cfg = () => cds.env.ojt || {}
const tz = () => cfg().timezone || 'Europe/Copenhagen'

/**
 * Free slots for a set of observers in a local date range.
 * Reads rules, blocked time and bookings from the database, plus Outlook busy time when configured.
 */
async function freeSlots({ observers, fromDay, toDay, durationMinutes, ignoreAppointmentId, extraBusy = [] }) {
  if (!observers.length) return []
  const { AvailabilityRules, AvailabilityExceptions, Appointments } = cds.entities('ojt')
  const ids = observers.map(o => o.ID)
  const fromUtc = localToUtc(fromDay, '00:00', tz()).toISOString()
  const toUtc = localToUtc(addDays(toDay, 1), '00:00', tz()).toISOString()

  const [rules, blocked, booked, outlook] = await Promise.all([
    SELECT.from(AvailabilityRules).where({ observer_ID: ids }),
    SELECT.from(AvailabilityExceptions).where({ observer_ID: ids }).and('day >=', fromDay).and('day <=', toDay),
    SELECT.from(Appointments).where({ observer_ID: ids, status: 'Booked' }).and('startAt <', toUtc).and('endAt >', fromUtc),
    calendar.getBusy(observers.map(o => o.email).filter(Boolean), fromUtc, toUtc)
  ])

  const notBefore = new Date(Date.now() + (cfg().minLeadHours ?? 2) * 3600e3)
  const slots = []
  for (const o of observers) {
    const busy = [
      ...booked.filter(b => b.observer_ID === o.ID && b.ID !== ignoreAppointmentId),
      ...(outlook.get(o.email) || []),
      ...extraBusy
    ]
    for (const s of freeSlotsFor({
      rules: rules.filter(r => r.observer_ID === o.ID),
      blocked: blocked.filter(b => b.observer_ID === o.ID),
      busy, fromDay, toDay, durationMinutes, tz: tz(), notBefore
    })) slots.push({ ...s, observerId: o.ID, observerName: o.name })
  }
  return slots.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.observerName.localeCompare(b.observerName))
}

/** Observers currently qualified for an item (optionally only one). */
async function qualifiedObservers(itemId, onlyObserverId) {
  const { Qualifications, Observers } = cds.entities('ojt')
  const today = new Date().toISOString().slice(0, 10)
  const quals = await SELECT.from(Qualifications).columns('observer_ID', 'validTo').where({ itemId })
  let ids = [...new Set(quals.filter(q => !q.validTo || q.validTo >= today).map(q => q.observer_ID))]
  if (onlyObserverId) ids = ids.filter(id => id === onlyObserverId)
  if (!ids.length) return []
  return SELECT.from(Observers).columns('ID', 'name', 'email', 'jobTitle').where({ ID: ids, active: true }).orderBy('name')
}

module.exports = { freeSlots, qualifiedObservers, tz, cfg }
