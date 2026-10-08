const cds = require('@sap/cds')
const LOG = cds.log('calendar')

/**
 * Outlook integration through Microsoft Graph.
 *
 * Events are created in a shared organizer mailbox (cds.ojt.organizerMailbox) with the
 * employee and the observer as attendees, so both get the invite and updates.
 *
 * In the demo there is no MS_GRAPH destination: every call is logged instead, and
 * getBusy returns nothing. The app works the same way, just without real invites.
 */

async function graph() {
  if (!cds.env.requires.MSGraph?.credentials) return null
  return cds.connect.to('MSGraph')
}

const mailbox = () => cds.env.ojt?.organizerMailbox
const graphTime = d => ({ dateTime: new Date(d).toISOString().replace('Z', ''), timeZone: 'UTC' })

function eventBody(a) {
  return {
    subject: `OJT observation: ${a.itemTitle}`,
    body: {
      contentType: 'HTML',
      content: `<p>${a.itemTitle} (${a.itemId})</p><p>Employee: ${a.employeeName}<br>Observer: ${a.observerName}</p>` +
        (a.note ? `<p>Note from employee: ${a.note}</p>` : '') +
        '<p>The observer records the result in SAP SuccessFactors Learning.</p>'
    },
    start: graphTime(a.startAt),
    end: graphTime(a.endAt),
    location: { displayName: a.location || '' },
    attendees: [
      { type: 'required', emailAddress: { address: a.employeeEmail, name: a.employeeName } },
      { type: 'required', emailAddress: { address: a.observerEmail, name: a.observerName } }
    ].filter(x => x.emailAddress.address),
    isReminderOn: true,
    reminderMinutesBeforeStart: 60
  }
}

async function sendInvite(a) {
  const g = await graph()
  if (!g) {
    LOG.info(`[demo] Outlook invite for "${a.itemTitle}" on ${a.startAt} to ${a.employeeName} and ${a.observerName}`)
    return `demo-${a.ID}`
  }
  const event = await g.send({ method: 'POST', path: `/v1.0/users/${mailbox()}/events`, data: eventBody(a) })
  return event.id
}

async function updateEvent(a) {
  const g = await graph()
  if (!g || !a.calendarEventId || a.calendarEventId.startsWith('demo-')) {
    return LOG.info(`[demo] Outlook event moved: "${a.itemTitle}" now ${a.startAt} with ${a.observerName}`)
  }
  await g.send({ method: 'PATCH', path: `/v1.0/users/${mailbox()}/events/${a.calendarEventId}`, data: eventBody(a) })
}

async function cancelEvent(a, reason) {
  const g = await graph()
  if (!g || !a.calendarEventId || a.calendarEventId.startsWith('demo-')) {
    return LOG.info(`[demo] Outlook event cancelled: "${a.itemTitle}" on ${a.startAt} (${reason || 'no reason'})`)
  }
  await g.send({
    method: 'POST',
    path: `/v1.0/users/${mailbox()}/events/${a.calendarEventId}/cancel`,
    data: { comment: reason || 'Cancelled in the OJT booking app' }
  })
}

async function sendReminder(a) {
  const g = await graph()
  if (!g) return LOG.info(`[demo] Reminder for "${a.itemTitle}" on ${a.startAt} to ${a.employeeName} and ${a.observerName}`)
  await g.send({
    method: 'POST',
    path: `/v1.0/users/${mailbox()}/sendMail`,
    data: {
      message: {
        subject: `Reminder: OJT observation ${a.itemTitle}`,
        body: { contentType: 'Text', content: `${a.itemTitle} starts ${a.startAt} at ${a.location || ''}.` },
        toRecipients: [a.employeeEmail, a.observerEmail].filter(Boolean).map(address => ({ emailAddress: { address } }))
      }
    }
  })
}

/**
 * Busy intervals from Outlook for the given e-mail addresses.
 * @returns {Promise<Map<string, {startAt:string,endAt:string}[]>>} by e-mail
 */
async function getBusy(emails, from, to) {
  const result = new Map()
  const g = await graph()
  if (!g || !emails.length) return result
  try {
    const r = await g.send({
      method: 'POST',
      path: `/v1.0/users/${mailbox()}/calendar/getSchedule`,
      data: { schedules: emails, startTime: graphTime(from), endTime: graphTime(to), availabilityViewInterval: 15 }
    })
    for (const s of r.value || []) {
      result.set(s.scheduleId, (s.scheduleItems || [])
        .filter(i => i.status !== 'free')
        .map(i => ({ startAt: i.start.dateTime + 'Z', endAt: i.end.dateTime + 'Z' })))
    }
  } catch (e) {
    LOG.warn('Could not read Outlook free/busy, using booking data only:', e.message)
  }
  return result
}

module.exports = { sendInvite, updateEvent, cancelEvent, sendReminder, getBusy }
