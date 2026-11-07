require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '3.26.166.30',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'school',
  password: process.env.DB_PASSWORD || 'password123',
  database: process.env.DB_NAME || 'schooldb',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true // return DATE columns as 'YYYY-MM-DD' strings
});

module.exports = pool;
