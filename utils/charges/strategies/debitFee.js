const { stripe, ACCOUNT_ID, PLATFORM_ACCOUNT_ID } = require('./../../../lib/stripe')
const logger = require('./../../../lib/logger')
const store = require('./../../../lib/store')

const { calculateFees } = require('./fees')

const chargePlatformAndTransfer = async function chargePlatformAndTransfer (amount, fundsImmediatelyAvailable = false) {
  const source = fundsImmediatelyAvailable ? 'tok_bypassPending' : 'tok_visa'
  const charge = await stripe.charges.create({
    amount,
    source,
    currency: 'gbp',
    expand: [ 'balance_transaction', 'transfer' ],
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

const recoupFeeFromConnect = async function recoupFeeFromConnect (charge) {
  const { net, fee } = calculateFees(charge)

  const transfer = await stripe.transfers.create({
    amount: -fee.total,
    currency: 'gbp',
    destination: process.env.STRIPE_PLATFORM_ACCOUNT_ID,
    expand: [ 'balance_transaction', 'destination_payment' ],
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

const refundWithReverse = async function refundWithReverse(chargeId, amount) {
  const refund = await stripe.refunds.create({
    charge: chargeId, ...amount && { amount },
    expand: [ 'balance_transaction' ],
    reverse_transfer: true,
    metadata: {
      account: ACCOUNT_ID }
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

const charge = async function charge (amount, fundsImmediatelyAvailable = false) {
  const charge = await chargePlatformAndTransfer(amount, fundsImmediatelyAvailable)
  const transfer = await recoupFeeFromConnect(charge)
  return { charge, transfer }
}


const refund = async function refund (chargeId, amount = undefined) {
  const chargeRefund = await refundWithReverse(chargeId, amount)
  return { refund: chargeRefund }
}


module.exports = { refund, charge }
