const cds = require('@sap/cds')
const sf = require('./lib/sf-learning')

module.exports = class AdminService extends cds.ApplicationService {
  async init() {
    // Value help: read observation items live from SF Learning
    this.on('READ', 'ObservationItems', async req => {
      const items = await sf.observationItems()
      const search = (req.req?.query?.$search || '').replace(/"/g, '').toLowerCase()
      const key = req.params?.[0]
      if (key) return items.find(i => i.itemID === (key.itemID ?? key))
      const rows = items
        .filter(i => !search || i.itemID.toLowerCase().includes(search) || i.title.toLowerCase().includes(search))
        .sort((a, b) => a.title.localeCompare(b.title))
      rows.$count = rows.length
      return rows
    })

    // Keep the item title next to the SF item ID, so lists stay readable
    this.before(['CREATE', 'UPDATE'], [this.entities.Qualifications, this.entities.Qualifications.drafts], async req => {
      if (!req.data.itemId) return
      const item = await sf.observationItem(req.data.itemId)
      if (!item) return req.error(400, `${req.data.itemId} is not an observation item in SF Learning.`, 'itemId')
      req.data.itemTitle = item.title
    })

    return super.init()
  }
}
