# Stripe charges/fee scenario utilities 

Simple helper methods for testing Stripe charge scenarios.

@TODO(sfount) round out 
* Simple `./setup` script for setting up Connect account and configuring 
envioronment variables 
* * Required: Stripe API Key `STRIPE_API_KEY`
* * Create new Connnect account (requires `./utils/accounts.js`)
* * Archive current datbase and set a random hash for the new one
* * Generate `.env` file that populates `STRIPE_ACCOUNT_ID`, `STRIPE_PLATFORM_ACCOUNT_ID`
`ROOT` and `DB` variables
* Split charges.js into two different methods for creating charges/ refunds 
(two separate files)
* `Statement` tab showing payouts summed by month group
* Update README with references to Stripe documentation, basic explanation and 
'How to get started' section
