/** Display name and e-mail from the logged-in user (IAS/XSUAA token or mocked user). */
const displayName = user =>
  [user?.attr?.givenName, user?.attr?.familyName].filter(Boolean).join(' ') || user?.id

const email = user => user?.attr?.email

module.exports = { displayName, email }
