import winston from 'winston';
import path from 'path';

// Конфигурация логгера
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // Запись ошибок в файл
    new winston.transports.File({ 
      filename: path.join('logs', 'error.log'), 
      level: 'error' 
    }),
    
    // Все логи в общий файл
    new winston.transports.File({ 
      filename: path.join('logs', 'combined.log') 
    }),
    
    // Вывод в консоль в development
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ] : [])
  ]
});

export default logger;