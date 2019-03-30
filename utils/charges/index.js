module.exports = {
  format : require('./format'),
  debitFee: require('./strategies/debitFee'),
  netTransfer: require('./strategies/netTransfer')
}
