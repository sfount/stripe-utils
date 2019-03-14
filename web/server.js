const dotenv = require('dotenv').config()
const express = require('express')

const charges = require('./../utils/charges')

const app = express()

app.set('view engine', 'pug')
app.set('views', './web/modules')

const currencyFormat = (amount) => amount.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })

const root = function root (req, res) {
  const context = charges.format()
  res.render('charges', context)
}

app.get('/', root)

app.listen(3000)
