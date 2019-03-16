const moment = require('moment')

const store = require('./../lib/store')

const penceToCurrency = (pence) => (pence / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })

const format = function format () {
  const payouts = store.read().get('payouts').value()

  const formatted = payouts.map((payout) => {
    payout.charges = penceToCurrency(payout.charges)
    payout.fees = penceToCurrency(payout.fees)
    payout.refunds = penceToCurrency(payout.refunds)
    payout.net = penceToCurrency(payout.net)

    payout.date = moment.unix(payout.created).calendar()
    payout.title = moment.unix(payout.created).format('dddd, MMMM Do YYYY')
    return payout
  })
  return { payouts: formatted }
}

module.exports = { format }
