const moment = require('moment')
const _ = require('lodash')

const store = require('./../../lib/store')

const penceToCurrency = (pence) => (pence / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })

const timestamps = function timestamps (charge) {
  charge.date = moment.unix(charge.created).calendar()
  return charge
}

const currencies = function currencies (charge) {
  charge.totalFormat = penceToCurrency(charge.total)
  charge.feesFormat = penceToCurrency(charge.fees)
  charge.netFormat = penceToCurrency(charge.net)

  if (charge.fee_details) {
    charge.fee_details.applicationFormat = penceToCurrency(charge.fee_details.application)
  }
  return charge
}

const format = function format(payout) {
  const filter = payout ? { payout_id: payout } : {}
  const readCharges = store.read().get('charges').filter(filter).value()
  const readRefunds = store.read().get('refunds').filter(filter).value()

  const calculateTotals = (transactions) => {
    return {
      amount: penceToCurrency(_.sumBy(transactions, 'total')),
      fees: penceToCurrency(_.sumBy(transactions, 'fees')),
      net: penceToCurrency(_.sumBy(transactions, 'net')),
      application_fees: penceToCurrency(_.sumBy(transactions, 'fee_details.application'))
    }
  }

  const rows = {
    charges: {
      totals: calculateTotals(readCharges),
      transactions: _.sortBy(readCharges.map(timestamps).map(currencies), 'created').reverse()
    },
    refunds: {
      totals: calculateTotals(readRefunds),
      transactions: _.sortBy(readRefunds.map(timestamps).map(currencies), 'created').reverse()
    }
  }

  const totals = {
    amount: penceToCurrency(_.sumBy(readCharges, 'total') - _.sumBy(readRefunds, 'total')),
    fees: penceToCurrency(_.sumBy(readCharges, 'fees') - _.sumBy(readRefunds, 'fees')),
    net: penceToCurrency(_.sumBy(readCharges, 'net') - _.sumBy(readRefunds, 'net')),
    application_fees: penceToCurrency(_.sumBy(readCharges, 'fee_details.application_fees') - _.sumBy(readRefunds, 'fee_details.application_fees'))
  }
  return { rows, totals, filtered: payout }
}

module.exports = format
