const winston = require('winston')

const formatter = winston.format.printf((log) => `${log.timestamp} ${log.level}: ${log.message}`)

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.splat(),
    formatter
  ),
  transports: [ new winston.transports.Console({ level: 'info' }) ]
})

module.exports = logger
