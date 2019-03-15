const _ = require('lodash')

const logger = require('./../lib/logger')
const { stripe, ACCOUNT_ID } = require('./../lib/stripe')
const store = require('./../lib/store')
const pages = require('./../lib/pages')

const syncChargesFromPlatformAccount = async function getChargesFromPlatformAccount () {
  const charges = await stripe.charges.list({})

  for (const charge of charges.data) {
    const transfers = await stripe.transfers.list({
      transfer_group: charge.transfer_group
    })
    const connectTransfer = transfers.data[0]

    // this was an original card payment
    if (charge.source.object === 'card') {
      store.get('charges')
        .push({
          id: charge.id,
          total: charge.amount,
          account: charge.on_behalf_of,
          settled: false,
          net: connectTransfer.amount,
          fees: charge.amount - connectTransfer.amount,
          fee_details: {
            stripe: connectTransfer.metadata.stripe_fee,
            application: connectTransfer.metadata.application_fee,
            total: connectTransfer.metadata.total_fee
          },
          stripe_total: charge.amount,
          stripe_net: connectTransfer.amount,
          stripe_connect_transfer_id: connectTransfer.id,
          stripe_connect_payment_id: connectTransfer.destination_payment,
          group: charge.transfer_group,
          refunded: charge.refunded,
          created: charge.created,
          transferred: connectTransfer.created
        })
        .write()
      logger.info(`Charge record created for ${charge.id} in local JSON storage`)
    }
  }
  return store.get('charges').value()
}

const syncRefundsFromPlatformAccount = async function getRefundsFromPlatformAccount () {
  const refunds = await stripe.refunds.list({})

  for (const refund of refunds.data) {
    const charge = await stripe.charges.retrieve(refund.charge)
    const payments = await stripe.transfers.list({ transfer_group: charge.transfer_group }, { stripe_account: ACCOUNT_ID })
    const connectTransfer = payments.data[0]

    store.get('refunds')
      .push({
        id: refund.id,
        charge: refund.charge,
        total: refund.amount,
        fees: 0,
        net: refund.amount,
        stripe_transaction_id: refund.balance_transaction,
        created: refund.created,
        stripe_connect_transfer_id: connectTransfer.id,
        stripe_platform_payment_id: connectTransfer.destination_payment,
        stripe_connect_transfer_transaction: connectTransfer.balance_transaction,
        transferred: connectTransfer.created,
        group: charge.transfer_group
      })
      .write()
    logger.info(`Refund record created for ${refund.id} on ${charge.id} in local JSON storage`)
  }
  return store.get('refunds').value()
}

const syncPayouts = async function syncPayouts (account) {
  // const payouts = await pages.all(stripe.payouts, account)
  const payouts = await pages.all(stripe.payouts, 'list', account)
  logger.info(`A total of ${payouts.length} payout found for account ${account}`)

  for (const payout of payouts) {
    const transactions = await pages.all(stripe.balance, 'listTransactions', account, { payout: payout.id, expand: [ 'data.source', 'data.source.source_transfer' ] })
    const referencedCharges = []
    const referencedRefunds = []
    logger.info(`${transactions.length} transactions make up payout ${payout.id}`)

    const grouped = _.groupBy(transactions, 'type')
    const stripeTransactionTotals = Object.keys(grouped).reduce((aggregate, key) => {
      const count = grouped[key].length
      const amount = _.sumBy(grouped[key], 'amount')
      aggregate[key] = { amount, count }
      return aggregate
    }, {})

    // 1. write payout to table
    store.get('payouts')
      .push({
        id: payout.id,
        created: payout.created,
        arrival_date: payout.arrival_date,
        automatic: payout.automatic,
        stripe_amount: payout.amount,
        stripe_total_charges_net: stripeTransactionTotals.payment,
        stripe_total_refunds: stripeTransactionTotals.transfer
      })
      .write()

    for (const transaction of transactions) {

      // this is money in from charges
      if (transaction.type === 'payment') {
        const { source } = transaction
        const transferToConnect = source.source_transfer
        const charge = transferToConnect.source_transaction

        // 2. update charge to reflect paid out status
        const localCharge = store.read().get('charges').find({ id: charge }).value()
        referencedCharges.push(localCharge)

        store.get('charges').find({ id: charge }).assign({ settled: true, payout_id: payout.id }).write()
        logger.info(`Charge ${charge} is included in this payout`)
      }

      // this is money out for refunds
      if (transaction.type === 'transfer') {
        // @TODO(sfount) don't rely on metadata to work this out
        const { source } = transaction
        const { refund } = source.metadata

        if (!refund) { throw new Error(`Corrupt refund transfer found ${transaction.id}`) }

        const localRefund = store.read().get('refunds').find({ id: refund }).value()
        referencedRefunds.push(localRefund)

        store.get('refunds').find({ id: refund }).assign({ settled: true, payout_id: payout.id }).write()
        logger.info(`Refund ${refund} is included in this payout`)
      }
    }

    // GOV.UK Pay summing and final word (tm)
    const localTotals = {
      charges: _.sumBy(referencedCharges, 'total'),
      fees: _.sumBy(referencedCharges, 'fees'),
      refunds: _.sumBy(referencedRefunds, 'total')
    }

    store.get('payouts')
      .find({ id: payout.id })
      .assign({ charges: localTotals.charges, fees: localTotals.fees, net: localTotals.charges - localTotals.fees, refunds: localTotals.refunds })
      .write()

    logger.info(`Grouped transactions for this payout are ${stripeTransactionTotals.payment.amount} in charges, ${stripeTransactionTotals.transfer.amount} in refunds, totalling ${stripeTransactionTotals.payout.amount}`)

    if (stripeTransactionTotals.payment.amount !== (localTotals.charges - localTotals.fees)) {
      throw new Error('Payout payments and locally referenced charges and fees don\'t line up - we haven\'t planned for supporting any reason for this')
    }

    if (-stripeTransactionTotals.payout.amount !== (localTotals.charges - localTotals.fees - localTotals.refunds)) {
      console.log('payout total', stripeTransactionTotals.payout.amount)
      console.log('calculated locally', (localTotals.charges - localTotals.fees - localTotals.refunds))
      throw new Error('Payout total and locally referenced charges, fees and refunds don\'t line up - we haven\'t planned for supporting any reason for this')
    }

    // currently supported/ expected - payout, transfer, payment
    if (Object.keys(grouped).length > 3) {
      throw new Error('Unkown number of transaction types included in payout')
    }
    if (stripeTransactionTotals.payment.count !== referencedCharges.length) {
      throw new Error('Found unaccounted for charges -- unsure of what to do with this information')
    }
    if (stripeTransactionTotals.transfer.count !== referencedRefunds.length) {
      throw new Error('Found unaccounted for refunds -- unsure of what to do with this information')
    }
  }

  return payouts
}

const account = async function account () {
  const charges = await syncChargesFromPlatformAccount()
  const refunds = await syncRefundsFromPlatformAccount()
  return { charges, refunds }
}

const payouts = async function payouts () {
  // use default environment account for now
  const accountPayouts = syncPayouts(ACCOUNT_ID)
  return accountPayouts
}

module.exports = { account, payouts }
