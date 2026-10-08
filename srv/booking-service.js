const cds = require('@sap/cds')
const sf = require('./lib/sf-learning')
const calendar = require('./lib/calendar')
const { freeSlots, qualifiedObservers, tz, cfg } = require('./lib/availability')
const { localDay, addDays } = require('./lib/time')
const { displayName, email } = require('./lib/user')

const STATUS_ORDER = { ToBook: 1, Booked: 2, AwaitingResult: 3, Completed: 4 }

module.exports = class BookingService extends cds.ApplicationService {
  async init() {
    const { Appointments, Observers } = cds.entities('ojt')
    const { MyAppointments } = this.entities

    // Every employee only ever sees their own appointments
    this.before('READ', MyAppointments, req => {
      req.query.where({ employeeId: req.user.id })
    })

    // ---------------------------------------------------------------------
    // My observations = SF Learning assignments (live) + my bookings
    // ---------------------------------------------------------------------
    this.on('READ', 'MyObservations', async req => {
      const user = req.user.id
      const [assignments, booked] = await Promise.all([
        sf.observationAssignments(user),
        SELECT.from(Appointments, a => { a('*'), a.observer(o => o.name) }).where({ employeeId: user, status: 'Booked' })
      ])
      const now = Date.now()
      let rows = assignments.map(a => {
        const ap = booked.find(b => b.itemId === a.itemId)
        const status = a.completed ? 'Completed'
          : ap ? (new Date(ap.endAt).getTime() < now ? 'AwaitingResult' : 'Booked')
          : 'ToBook'
        return {
          itemId: a.itemId,
          title: a.title,
          dueDate: a.dueDate,
          durationMinutes: a.durationMinutes,
          location: a.location,
          preparation: a.preparation,
          status,
          statusOrder: STATUS_ORDER[status],
          completedOn: a.completedOn,
          appointmentId: (!a.completed && ap?.ID) || null,
          appointmentStart: (!a.completed && ap?.startAt) || null,
          appointmentEnd: (!a.completed && ap?.endAt) || null,
          observerName: (!a.completed && ap?.observer?.name) || null
        }
      })
      rows.sort((x, y) => x.statusOrder - y.statusOrder || String(x.dueDate).localeCompare(String(y.dueDate)))

      const key = req.params?.[0]
      if (key) {
        const itemId = typeof key === 'object' ? key.itemId : key
        const row = rows.find(r => r.itemId === itemId)
        return row || req.reject(404, `Observation ${itemId} is not assigned to you.`)
      }
      rows.$count = rows.length
      return rows
    })

    // ---------------------------------------------------------------------
    // Who can observe, and when
    // ---------------------------------------------------------------------
    this.on('qualifiedObservers', async req => {
      const { itemId } = req.data
      await this._assertOpen(req, itemId)
      const list = await qualifiedObservers(itemId)
      return list.map(({ ID, name, jobTitle }) => ({ ID, name, jobTitle }))
    })

    this.on('freeSlots', async req => {
      const { itemId, observerId } = req.data
      const item = await this._assertOpen(req, itemId)
      const today = localDay(new Date(), tz())
      const horizon = addDays(today, cfg().bookingHorizonDays ?? 28)
      const fromDay = req.data.fromDate && req.data.fromDate > today ? req.data.fromDate : today
      const toDay = req.data.toDate && req.data.toDate < horizon ? req.data.toDate : horizon
      const observers = await qualifiedObservers(itemId, observerId)
      // Don't offer times when the employee already has another observation
      const mine = await SELECT.from(Appointments).columns('ID', 'startAt', 'endAt', 'itemId')
        .where({ employeeId: req.user.id, status: 'Booked' })
      const ownBooking = mine.find(m => m.itemId === itemId)
      return freeSlots({
        observers, fromDay, toDay,
        durationMinutes: item.durationMinutes,
        ignoreAppointmentId: ownBooking?.ID,
        extraBusy: mine.filter(m => m.itemId !== itemId)
      })
    })

    // ---------------------------------------------------------------------
    // Book
    // ---------------------------------------------------------------------
    this.on('book', async req => {
      const { itemId, observerId, startAt, note } = req.data
      const user = req.user.id
      const item = await this._assertOpen(req, itemId)

      const existing = await SELECT.one.from(Appointments).where({ employeeId: user, itemId, status: 'Booked' })
      if (existing) return req.reject(409, 'You already have a booking for this observation. Move that booking instead.')

      const observer = (await qualifiedObservers(itemId, observerId))[0]
      if (!observer) return req.reject(400, 'The selected observer is not qualified for this observation.')

      await this._lockObserver(observerId)
      const slot = await this._findSlot({ observer, item, startAt, user })
      if (!slot) return req.reject(409, 'That time is no longer available. Pick another time.')

      const ID = cds.utils.uuid()
      const appointment = {
        ID,
        employeeId: user,
        employeeName: displayName(req.user),
        employeeEmail: email(req.user),
        observer_ID: observer.ID,
        itemId,
        itemTitle: item.title,
        startAt: slot.startAt,
        endAt: slot.endAt,
        location: item.location,
        note: note?.slice(0, 500) || null,
        status: 'Booked'
      }
      await INSERT.into(Appointments).entries(appointment)

      // Outlook invite only after the booking is committed
      req.on('succeeded', () => cds.spawn(async () => {
        const id = await calendar.sendInvite({ ...appointment, observerName: observer.name, observerEmail: observer.email })
        await UPDATE(Appointments, ID).with({ calendarEventId: id })
      }))
      return SELECT.one.from(MyAppointments, ID)
    })

    // ---------------------------------------------------------------------
    // Move to another time (and possibly another observer)
    // ---------------------------------------------------------------------
    this.on('reschedule', async req => {
      const { appointmentId, observerId, startAt } = req.data
      const user = req.user.id
      const appt = await this._myOpenAppointment(req, appointmentId)
      this._assertBeforeCutoff(req, appt, 'moved')

      const item = await this._assertOpen(req, appt.itemId)
      const observer = (await qualifiedObservers(appt.itemId, observerId || appt.observer_ID))[0]
      if (!observer) return req.reject(400, 'The selected observer is not qualified for this observation.')

      await this._lockObserver(observer.ID)
      const slot = await this._findSlot({ observer, item, startAt, user, ignoreAppointmentId: appt.ID })
      if (!slot) return req.reject(409, 'That time is no longer available. Pick another time.')

      await UPDATE(Appointments, appt.ID).with({
        observer_ID: observer.ID,
        startAt: slot.startAt,
        endAt: slot.endAt,
        rescheduleCount: (appt.rescheduleCount || 0) + 1,
        reminderSentAt: null
      })
      req.on('succeeded', () => cds.spawn(() => calendar.updateEvent({
        ...appt, observer_ID: observer.ID, observerName: observer.name, observerEmail: observer.email,
        startAt: slot.startAt, endAt: slot.endAt
      })))
      return SELECT.one.from(MyAppointments, appt.ID)
    })

    // ---------------------------------------------------------------------
    // Cancel
    // ---------------------------------------------------------------------
    this.on('cancel', async req => {
      const { appointmentId, reason } = req.data
      const appt = await this._myOpenAppointment(req, appointmentId)
      this._assertBeforeCutoff(req, appt, 'cancelled')
      await UPDATE(Appointments, appt.ID).with({ status: 'Cancelled', cancelReason: reason || null })
      req.on('succeeded', () => cds.spawn(() => calendar.cancelEvent(appt, reason)))
      return SELECT.one.from(MyAppointments, appt.ID)
    })

    return super.init()
  }

  // ----------------------------------------------------------------------- helpers

  /** The item must be assigned to the user in SF Learning and not completed. */
  async _assertOpen(req, itemId) {
    if (!itemId) return req.reject(400, 'Choose an observation first.')
    const item = await sf.openObservation(req.user.id, itemId)
    if (!item) return req.reject(403, 'This observation is not assigned to you, or it is already completed.')
    return item
  }

  async _myOpenAppointment(req, ID) {
    const { Appointments } = cds.entities('ojt')
    const appt = await SELECT.one.from(Appointments).where({ ID, employeeId: req.user.id })
    if (!appt) return req.reject(404, 'Booking not found.')
    if (appt.status !== 'Booked') return req.reject(400, 'This booking is already cancelled.')
    return appt
  }

  _assertBeforeCutoff(req, appt, verb) {
    const hours = cds.env.ojt?.changeCutoffHours ?? 24
    if (new Date(appt.startAt).getTime() - Date.now() < hours * 3600e3) {
      req.reject(400, `Bookings can't be ${verb} less than ${hours} hours before the start. Please contact your observer.`)
    }
  }

  /** Serialise bookings per observer, so two people can't take the same slot at the same moment. */
  async _lockObserver(ID) {
    const { Observers } = cds.entities('ojt')
    await SELECT.one.from(Observers, ID).columns('ID').forUpdate()
  }

  /** Re-check on the server that the requested start is a slot we would actually offer. */
  async _findSlot({ observer, item, startAt, user, ignoreAppointmentId }) {
    const { Appointments } = cds.entities('ojt')
    const start = new Date(startAt)
    if (isNaN(start)) return null
    const day = localDay(start, tz())
    const mine = await SELECT.from(Appointments).columns('ID', 'startAt', 'endAt')
      .where({ employeeId: user, status: 'Booked' })
    const slots = await freeSlots({
      observers: [observer], fromDay: day, toDay: day,
      durationMinutes: item.durationMinutes,
      ignoreAppointmentId,
      extraBusy: mine.filter(m => m.ID !== ignoreAppointmentId)
    })
    return slots.find(s => new Date(s.startAt).getTime() === start.getTime())
  }
}
