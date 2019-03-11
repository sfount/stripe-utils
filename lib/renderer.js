const pug = require('pug')
const fs = require('fs-extra')

// @TODO(sfount) use path to avoid relative directories
const TEMPLATE_DIRECTORY = './utils'
const OUTPUT_DIRECTORY = './out'

const renderHTMLFile = function renderHTMLFile (key, context) {
  // @TODO(sfount) currently hardcoded to one key file
  const template = pug.renderFile(`${TEMPLATE_DIRECTORY}/${key}/${key}.pug`, context)
  fs.outputFileSync(`${OUTPUT_DIRECTORY}/${key}.html`, template)
}

module.exports = renderHTMLFile
