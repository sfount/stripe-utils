const { stripe, ACCOUNT_ID, PLATFORM_ACCOUNT_ID } = require('./../../../lib/stripe')
const logger = require('./../../../lib/logger')
const store = require('./../../../lib/store')

const { calculateFees } = require('./fees')

// const directCharge = async function directCharge (amount, fundsImmediatelyAvailable = false)  {
//   const source = fundsImmediatelyAvailable ? 'tok_bypassPending' : 'tok_visa'
//   const charge = await stripe.charges.create({
//     amount,
//     source,
//     currency: 'gbp',
//     expand: [ 'balance_transaction' ],
//   }, {
//     STRIPE_ACCOUNT: ACCOUNT_ID
//   })
// }

