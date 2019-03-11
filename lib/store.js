const low = require('lowdb')
const path = require('path')
const FileSync = require('lowdb/adapters/FileSync')

const adapter = new FileSync(path.join(process.env.ROOT, 'store/db.json'))
const db = low(adapter)

db.defaults({ charges: [], payouts: [], refunds: [] })
  .write()

module.exports = db
