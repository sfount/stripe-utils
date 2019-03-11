// validate environment
if (!process.env.STRIPE_API_KEY) {
  throw new Error('Missing required Stripe API key `STRIPE_API_KEY`')
}

const ACCOUNT_ID = process.env.STRIPE_ACCOUNT_ID
const PLATFORM_ACCOUNT_ID = process.env.STRIPE_PLATFORM_ACCOUNT_ID

const stripe = require('stripe')(process.env.STRIPE_API_KEY)

module.exports = {
  stripe,
  ACCOUNT_ID,
  PLATFORM_ACCOUNT_ID
}
