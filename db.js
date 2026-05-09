const mysql = require("mysql2/promise");
require("dotenv").config();

const config = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "simple_pos_db",
  waitForConnections: true,
  connectionLimit: 10,
};

const pool = mysql.createPool(config);

async function initDatabase() {
  const adminPool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    waitForConnections: true,
    connectionLimit: 2,
  });

  await adminPool.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\``);
  await adminPool.end();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('admin','cashier','customer') NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      price DECIMAL(10,2) NOT NULL DEFAULT 0,
      stock INT NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      total DECIMAL(10,2) NOT NULL,
      discount DECIMAL(10,2) NOT NULL DEFAULT 0,
      cash DECIMAL(10,2) NOT NULL,
      \`change\` DECIMAL(10,2) NOT NULL,
      cashier_id INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transaction_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transaction_id INT NOT NULL,
      product_id INT NOT NULL,
      name_snapshot VARCHAR(255) NOT NULL,
      price_snapshot DECIMAL(10,2) NOT NULL,
      qty INT NOT NULL,
      subtotal DECIMAL(10,2) NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS borrowers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS utang_entries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      borrower_id INT NOT NULL,
      description VARCHAR(255) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS utang_payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      borrower_id INT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_shifts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      time_in TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      time_out TIMESTAMP NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      description VARCHAR(255) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const [rows] = await pool.query("SELECT COUNT(*) AS count FROM users");
  if (!rows[0].count) {
    await pool.query(
      "INSERT INTO users (username, password, role) VALUES (?, ?, ?), (?, ?, ?)",
      ["admin", "admin123", "admin", "cashier", "cashier123", "cashier"]
    );
  }
}

async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  pool,
  initDatabase,
  withTransaction,
};
