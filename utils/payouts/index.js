const _ = require('lodash')

const renderer = require('./../../lib/renderer')
const logger = require('./../../lib/logger')
const { stripe, ACCOUNT_ID } = require('./../../lib/stripe')

const accountBalance = async function accountBalance () {
  return stripe.balance.retrieve({ stripe_account: ACCOUNT_ID })
}

const getTransactionsPage = async function getTransactionsPage (payoutId, startingAfter = undefined) {
  const MAX_REQUEST_SIZE = 1000
  const transactions = await stripe.balance.listTransactions({ payout: payoutId, limit: MAX_REQUEST_SIZE, ...startingAfter && { starting_after: startingAfter }}, { stripe_account: ACCOUNT_ID })
  return transactions
}

// @TODO(sfount) - doesn't consider corner cases, would need to be carefully tested
// navigate pagination to get all transactions for a given payout
const getAllTransactionsForPayout = async function getAllTransactionsForPayout (payoutId) {
  const transactions = []

  // get the first page of transactions - this should not worry about the size
  const initialRequest = await getTransactionsPage(payoutId)
  transactions.push(...initialRequest.data)

  const status = { moreTransactionsExist: initialRequest.has_more }

  while (status.moreTransactionsExist) {
    const latestTransaction = transactions[transactions.length - 1]
    const pageRequest = await getTransactionsPage(payoutId, latestTransaction.id)
    transactions.push(...pageRequest.data)
    status.moreTransactionsExist = pageRequest.has_more
  }

  return transactions
}

// expects a flat list of transactions
// groups can be:
// charge, refund, adjustment, application_fee, application_fee_refund, transfer,
// payment, payout, payout_failure, stripe_fee, or network_cost
const parseTransactionByType = function parseTransactionByType (transactions) {
  // { ...transactions } clone original transactions object
  const parsed = _.groupBy({ ...transactions }, 'type')
  return parsed
}

// sums grouped transactions
const sumTransactions = function sumTransactions (groupedTransactions) {
  // for each of the categories
  const totals = Object.keys(groupedTransactions).reduce((aggregate, key) => {
    const count = groupedTransactions[key].length
    const gross = _.sumBy(groupedTransactions[key], 'amount')
    const fees = _.sumBy(groupedTransactions[key], 'fee')
    aggregate[key] = { count, gross, fees }
    return aggregate
  }, {})
  return totals
}

const payouts = async function payouts () {
  const balance = await stripe.balance.retrieve({ stripe_account: ACCOUNT_ID })
  logger.info(`Retrieved account balance for ${ACCOUNT_ID}`)
  console.log(balance)
  console.log(balance.available[0].source_types)

  const transactions = await getAllTransactionsForPayout('po_1EBXMICjPBXDsVS5DWdY5J91')
  const parsed = parseTransactionByType(transactions)

  const totals = sumTransactions(parsed)
  console.log(totals)

  return balance
}

const render = async function render () {
  const context = await payouts()
  renderer('payouts', context)
}

module.exports = { render }
