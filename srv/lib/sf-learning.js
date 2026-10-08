const cds = require('@sap/cds')

/**
 * The only file that knows SuccessFactors Learning's entity and field names.
 * When the real API is imported, adjust the mapping here and nothing else.
 *
 * Rule from the requirements: this app READS from SF Learning and never writes to it.
 * The guard below rejects any write, even if someone adds one by mistake later.
 */

let _sf
async function sf() {
  if (_sf) return _sf
  const srv = await cds.connect.to('SFLearning')
  srv.before('*', req => {
    if (req.event !== 'READ') req.reject(405, 'SF Learning is read-only for the OJT booking app.')
  })
  return (_sf = srv)
}

const observationType = () => cds.env.ojt?.observationItemType ?? 'OJT_OBS'

const mapItem = i => ({
  itemId: i.itemID,
  title: i.title,
  durationMinutes: i.durationMinutes || 60,
  location: i.location,
  preparation: i.preparation
})

/** All observation items assigned to a user, with completion status from SF. */
async function observationAssignments(userId) {
  const srv = await sf()
  const { LearningAssignments, LearningItems } = srv.entities
  const assignments = await srv.run(SELECT.from(LearningAssignments).where({ userID: userId }))
  if (!assignments.length) return []
  const items = await srv.run(SELECT.from(LearningItems).where({ itemID: assignments.map(a => a.itemID) }))
  const observations = new Map(items.filter(i => i.itemType === observationType()).map(i => [i.itemID, i]))
  return assignments
    .filter(a => observations.has(a.itemID))
    .map(a => ({
      ...mapItem(observations.get(a.itemID)),
      dueDate: a.dueDate,
      completed: a.status === 'COMPLETED',
      completedOn: a.completionDate
    }))
}

/** The assignment if the user has this observation item assigned and not completed, else undefined. */
async function openObservation(userId, itemId) {
  return (await observationAssignments(userId)).find(a => a.itemId === itemId && !a.completed)
}

/** A single observation item (for titles in admin and calendar texts). */
async function observationItem(itemId) {
  const srv = await sf()
  const i = await srv.run(SELECT.one.from(srv.entities.LearningItems).where({ itemID: itemId }))
  return i && i.itemType === observationType() ? mapItem(i) : undefined
}

/** All observation items (value help for admins). */
async function observationItems() {
  const srv = await sf()
  const items = await srv.run(SELECT.from(srv.entities.LearningItems).where({ itemType: observationType() }))
  return items.map(i => ({ itemID: i.itemID, title: i.title, durationMinutes: i.durationMinutes, location: i.location }))
}

module.exports = { sf, observationAssignments, openObservation, observationItem, observationItems }
