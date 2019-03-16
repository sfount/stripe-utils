const moment = require('moment')
const _ = require('lodash')

const { stripe, ACCOUNT_ID, PLATFORM_ACCOUNT_ID } = require('./../lib/stripe')
const logger = require('./../lib/logger')
const store = require('./../lib/store')

const chargePlatform = async function chargePlatform (amount, fundsImmediatelyAvailable = false) {
  const source = fundsImmediatelyAvailable ? 'tok_bypassPending' : 'tok_visa'
  const charge = await stripe.charges.create({
    amount,
    source,
    currency: 'gbp',
    expand: [ 'balance_transaction' ],
    on_behalf_of: ACCOUNT_ID,
    metadata: {
      account: ACCOUNT_ID
    }
  })

  logger.info(`Stripe API created charge with id ${charge.id}`)
  logger.debug('%O', charge)

  store.get('charges')
    .push({
      id: charge.id,
      total: charge.amount,
      account: charge.on_behalf_of,
      settled: false,
      refunded: false,
      created: charge.created
    })
    .write()
  logger.info(`Charge ${charge.id} written to local JSON store`)
  return charge
}

const chargePlatformAndTransfer = async function chargePlatformAndTransfer (amount, fundsImmediatelyAvailable = false) {
  const source = fundsImmediatelyAvailable ? 'tok_bypassPending' : 'tok_visa'
  const charge = await stripe.charges.create({
    amount,
    source,
    currency: 'gbp',
    expand: [ 'balance_transaction' ],
    on_behalf_of: ACCOUNT_ID,
    transfer_data: {
      destination: ACCOUNT_ID
    },
    metadata: {
      account: ACCOUNT_ID
    }
  })

  logger.info(`Stripe API created charge with id ${charge.id}`)
  logger.debug('%O', charge)

  store.get('charges')
    .push({
      id: charge.id,
      total: charge.amount,
      account: charge.on_behalf_of,
      settled: false,
      refunded: false,
      created: charge.created
    })
    .write()
  logger.info(`Charge ${charge.id} written to local JSON store`)
  return charge
}

const calculateFees = function calculateFees (charge) {
  const applicationFeePercentage = 0.08
  const applicationFeeAmount = Math.ceil((applicationFeePercentage / 100) * charge.amount)

  const fee = { stripe: charge.balance_transaction.fee, application: applicationFeeAmount }
  fee.total = fee.stripe + fee.application

  const net = charge.amount - fee.total
  return { net, fee }
}

const recoupFeeFromConnect = async function recoupFeeFromConnect (charge) {
  const { net, fee } = calculateFees(charge)

  const transfer = await stripe.transfers.create({
    amount: fee.total,
    currency: 'gbp',
    destination: process.env.STRIPE_PLATFORM_ACCOUNT_ID,
    expand: [ 'balance_transaction', 'destination_payment' ],

    // this will automatically set the transfer_group
    transfer_group: charge.transfer_group,
    metadata: {
      stripe_fee: fee.stripe,
      application_fee: fee.application,
      total_fee: fee.total,
      charge: charge.id
    }
  }, {
    stripe_account: ACCOUNT_ID
  })

  logger.info(`Stripe API created transfer with id ${transfer.id} to recoup fee for charge ${charge.id}`)
  logger.debug('%O', transfer)

  store.get('charges')
    .find({ id: charge.id })
    .assign({
      net,
      fees: fee.total,
      fee_details: fee,
      stripe_total: charge.amount,
      stripe_net: charge.amount - transfer.amount,

      // transfer from platform to connect, total less fees
      stripe_connect_transfer_id: transfer.id,

      // actual payment carrying out transfer from platform to connect
      stripe_connect_payment_id: transfer.destination_payment.id,
      group: transfer.transfer_group,
      transferred: transfer.created
    })
    .write()
  logger.info(`Charge ${charge.id} updated with transfer values to local JSON store`)

  return transfer
}

const transferToConnect = async function transferToConnect (charge) {
  const { net, fee } = calculateFees(charge)

  const transfer = await stripe.transfers.create({
    amount: net,
    currency: 'gbp',
    destination: ACCOUNT_ID,
    expand: [ 'balance_transaction', 'destination_payment' ],

    // this will automatically set the transfer_group
    source_transaction: charge.id,
    metadata: {
      stripe_fee: fee.stripe,
      application_fee: fee.application,
      total_fee: fee.total
    }
  })

  logger.info(`Stripe API created transfer with id ${transfer.id} for charge ${charge.id}`)
  logger.debug('%O', transfer)

  store.get('charges')
    .find({ id: charge.id })
    .assign({
      net,
      fees: fee.total,
      fee_details: fee,
      stripe_total: charge.amount,
      stripe_net: charge.amount - transfer.amount,

      // transfer from platform to connect, total less fees
      stripe_connect_transfer_id: transfer.id,

      // actual payment carrying out transfer from platform to connect
      stripe_connect_payment_id: transfer.destination_payment.id,
      group: transfer.transfer_group,
      transferred: transfer.created
    })
    .write()
  logger.info(`Charge ${charge.id} updated with transfer values to local JSON store`)

  return transfer
}

const refundPlatform = async function refundPlatform (chargeId) {
	const refund = await stripe.refunds.create({
    charge: chargeId,
		expand: [ 'balance_transaction' ],
    metadata: {
      account: ACCOUNT_ID
    }
  })

  logger.info(`Stripe API reversed platform charge ${chargeId}`)
	logger.debug('%O', refund)

	store.get('refunds')
		.push({
      id: refund.id,
      charge: refund.charge,
      total: refund.amount,
      fees: 0,
      net: refund.amount,
      stripe_transaction_id: refund.balance_transaction.id,
      settled: false,
      created: refund.created
    })
		.write()

	logger.info(`Refund ${refund.id} for charge ${refund.charge} written to local JSON store`)

	store.get('charges')
		.find({ id: refund.charge })
		.assign({ refunded: true })
		.write()
	return refund
}

const refundWithReverse = async function refundWithReverse(chargeId, amount) {
  const refund = await stripe.refunds.create({
    charge: chargeId,
    ...amount && { amount },
		expand: [ 'balance_transaction' ],
    reverse_transfer: true,
    metadata: {
      account: ACCOUNT_ID
    }
  })

  logger.info(`Stripe API refunded platform charge ${chargeId}`)
	logger.debug('%O', refund)

	store.get('refunds')
		.push({
      id: refund.id,
      charge: refund.charge,
      total: refund.amount,
      fees: 0,
      net: refund.amount,
      stripe_transaction_id: refund.balance_transaction.id,

      // the actual transfer that has been reversed from the connect account
      stripe_transfer_reversal: refund.transfer_reversal,
      settled: false,
      created: refund.created
    })
		.write()

	logger.info(`Refund ${refund.id} for charge ${refund.charge} written to local JSON store`)

	store.get('charges')
		.find({ id: refund.charge })
		.assign({ refunded: true })
		.write()
	return refund

}


const transferRefundFromConnect = async function transferRefundFromConnect (refund) {
	const charge = await stripe.charges.retrieve(refund.charge)
	const transfer = await stripe.transfers.create({
    amount: refund.amount,
    currency: 'gbp',
    destination: process.env.STRIPE_PLATFORM_ACCOUNT_ID,

    // note we can't use source transaction because the charge exists on the platform account
    transfer_group: charge.transfer_group,
		expand: [ 'balance_transaction' ],
    metadata: {
			charge: refund.charge,
      refund: refund.id
    }
  }, {
    stripe_account: ACCOUNT_ID
  })

	logger.info(`Stripe API created new transfer to recoup refund ${transfer.id} for refund ${refund.id}`)
	logger.debug('%O', transfer)

	store.get('refunds')
		.find({ id: refund.id })
		.assign({
      stripe_connect_transfer_id: transfer.id,
      stripe_platform_payment_id: transfer.destination_payment,
      stripe_connect_transfer_transaction: transfer.balance_transaction.id,
      transferred: transfer.created,
      group: transfer.transfer_group
    })
		.write()

	logger.info(`Refund ${refund.id} updated with details of Connect account transfer`)
	return transfer
}

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

// read local charges and format for display
/* const format = function format (payout) {
  const filter = payout ? { payout_id: payout } : {}
  const chargesIn = store.read().get('charges').filter(filter).value()
  let refundsIn = store.read().get('refunds').filter(filter).value()
  refundsIn = refundsIn
    .map((refund) => {
      refund.total = -refund.total
      refund.net = -refund.net
      refund.fees = -refund.fees
      return refund
    })

  const combined = refundsIn.concat(chargesIn)

  const totals = {
    transactions: {
      amount: penceToCurrency(_.sumBy(combined, 'total')),
      fees: penceToCurrency(_.sumBy(combined, 'fees')),
      net: penceToCurrency(_.sumBy(combined, 'net')),
      application_fees: penceToCurrency(_.sumBy(combined, 'fee_details.application'))
    },
    charges: {
      amount: penceToCurrency(_.sumBy(chargesIn, 'total')),
      fees: penceToCurrency(_.sumBy(chargesIn, 'fees')),
      net: penceToCurrency(_.sumBy(chargesIn, 'net')),
      application_fees: penceToCurrency(_.sumBy(chargesIn, 'fee_details.application')),
      stripe_fees: penceToCurrency(_.sumBy(chargesIn, 'fee_details.stripe'))
    },
    refunds: {
      amount: penceToCurrency(_.sumBy(refundsIn, 'total')),
      fees: penceToCurrency(_.sumBy(refundsIn, 'fees')),
      net: penceToCurrency(_.sumBy(refundsIn, 'net')),
      application_fees: penceToCurrency(_.sumBy(refundsIn, 'fee_details.application'))
    }
  }

  const formattedCharges = _.sortBy(chargesIn.map(timestamps).map(currencies), 'created').reverse()
  const formattedRefunds = _.sortBy(refundsIn.map(timestamps).map(currencies), 'created').reverse()

  // const formattedRefunds = refunds
    // .map(timestamps)
    // .map(currencies)

  // const transactions = _.sortBy(formatted, 'created').reverse()

  return { charges: formattedCharges, refunds: formattedRefunds, totals, filtered: payout }
}*/

const create = async function create (amount, fundsImmediatelyAvailable = false) {
  const charge = await chargePlatform(amount, fundsImmediatelyAvailable)
  const transfer = await transferToConnect(charge)
  return { charge, transfer }
}

const createDebitFee = async function createDebitFee (amount, fundsImmediatelyAvailable = false) {
  const charge = await chargePlatformAndTransfer(amount, fundsImmediatelyAvailable)
  const transfer = await recoupFeeFromConnect(charge)
  return { charge, transfer }
}

const refund = async function refund (chargeId) {
	const platformRefund = await refundPlatform(chargeId)
	const transfer = await transferRefundFromConnect(platformRefund)
	return { refund: platformRefund, transfer }
}

const refundDebitFee = async function refundDebitFee (chargeId, amount = undefined) {
  const chargeRefund = await refundWithReverse(chargeId, amount)
  return { refund: chargeRefund }
}

module.exports = { create, refund, format, createDebitFee, refundDebitFee }
