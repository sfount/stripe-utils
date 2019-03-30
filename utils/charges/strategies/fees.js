const calculateFees = function calculateFees (charge) {
  const applicationFeePercentage = 0.08
  const applicationFeeAmount = Math.ceil((applicationFeePercentage / 100) * charge.amount)

  const fee = { stripe: charge.balance_transaction.fee, application: applicationFeeAmount }
  fee.total = fee.stripe + fee.application

  const net = charge.amount - fee.total
  return { net, fee }
}

module.exports = { calculateFees }
