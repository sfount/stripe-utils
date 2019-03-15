const dotenv = require('dotenv').config()
const express = require('express')

const charges = require('./../utils/charges')
const payouts = require('./../utils/payouts')

const app = express()

app.set('view engine', 'pug')
app.set('views', './web/modules')

const currencyFormat = (amount) => amount.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })

const transactions = function transactions (req, res) {
  const payout = req.query.payout
  const context = charges.format(payout)
  res.render('transactions', context)
}

const listPayouts = function listPayouts (req, res) {
  const context = payouts.format()
  console.log('context', context)
  res.render('payouts', context)
}

app.get('/', (req, res) => res.redirect('/transactions'))
app.get('/transactions', transactions)
app.get('/payouts', listPayouts)

app.listen(3000)
