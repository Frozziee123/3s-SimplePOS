const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { pool, initDatabase, withTransaction } = require("./db");

const app = express();
const PORT = 3000;
const LOW_STOCK_THRESHOLD = 5;
const sessions = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function getUserFromToken(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  return token ? sessions.get(token) : null;
}

function requireAuth(req, res, next) {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
}

function asyncRoute(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      res.status(400).json({ error: e.message || "Request failed" });
    }
  };
}

app.post("/api/login", asyncRoute(async (req, res) => {
  const { username, password } = req.body;
  const [rows] = await pool.query(
    "SELECT id, username, role FROM users WHERE username = ? AND password = ? LIMIT 1",
    [username, password]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const token = crypto.randomUUID();
  sessions.set(token, user);
  res.json({ token, user });
}));

app.post("/api/logout", requireAuth, (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token) sessions.delete(token);
  res.json({ ok: true });});

app.get("/api/users", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const [rows] = await pool.query("SELECT id, username, role FROM users ORDER BY id DESC");
  res.json(rows);
}));

app.post("/api/users", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !['admin','cashier','customer'].includes(role)) return res.status(400).json({ error: "Invalid data" });
  const [result] = await pool.query(
    "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
    [username, password, role]
  );
  res.json({ id: result.insertId });
}));

app.put("/api/users/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { username, password, role } = req.body;
  if (password) {
    await pool.query(
      "UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?",
      [username, password, role, req.params.id]
    );
  } else {
    await pool.query(
      "UPDATE users SET username = ?, role = ? WHERE id = ?",
      [username, role, req.params.id]
    );
  }
  res.json({ ok: true });
}));

app.delete("/api/users/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  await pool.query("DELETE FROM users WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
}));

app.get("/api/products", requireAuth, asyncRoute(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM products ORDER BY id DESC");
  res.json(rows);
}));

app.post("/api/products", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { name, price, stock } = req.body;
  const [result] = await pool.query(
    "INSERT INTO products (name, price, stock) VALUES (?, ?, ?)",
    [name, Number(price || 0), Number(stock || 0)]
  );
  res.json({ id: result.insertId });
}));

app.put("/api/products/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { name, price, stock } = req.body;
  await pool.query(
    "UPDATE products SET name = ?, price = ?, stock = ? WHERE id = ?",
    [name, Number(price || 0), Number(stock || 0), req.params.id]
  );
  res.json({ ok: true });
}));

app.delete("/api/products/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  await pool.query("DELETE FROM products WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
}));

app.post("/api/transactions", requireAuth, asyncRoute(async (req, res) => {
  const { items = [], discount = 0, cash = 0 } = req.body;
  if (!items.length) return res.status(400).json({ error: "Empty cart" });

  const result = await withTransaction(async (conn) => {
    let gross = 0;
    const preparedItems = [];

    for (const item of items) {
      const [productRows] = await conn.query("SELECT * FROM products WHERE id = ? FOR UPDATE", [item.product_id]);
      const product = productRows[0];
      if (!product) throw new Error(`Product ${item.product_id} not found`);
      const qty = Number(item.qty || 0);
      if (qty <= 0) throw new Error("Quantity must be > 0");
      if (Number(product.stock) < qty) throw new Error(`Insufficient stock for ${product.name}`);

      const subtotal = Number(product.price) * qty;
      gross += subtotal;
      preparedItems.push({ product, qty, subtotal });
    }

    const total = Math.max(0, gross - Number(discount || 0));
    const cashNum = Number(cash || 0);
    if (cashNum < total) throw new Error("Cash is less than total");
    const change = cashNum - total;

    const [txResult] = await conn.query(
      "INSERT INTO transactions (total, discount, cash, `change`, cashier_id) VALUES (?, ?, ?, ?, ?)",
      [total, Number(discount || 0), cashNum, change, req.user.id]
    );
    const txId = txResult.insertId;

    for (const p of preparedItems) {
      await conn.query(
        "INSERT INTO transaction_items (transaction_id, product_id, name_snapshot, price_snapshot, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        [txId, p.product.id, p.product.name, p.product.price, p.qty, p.subtotal]
      );
      await conn.query("UPDATE products SET stock = stock - ? WHERE id = ?", [p.qty, p.product.id]);
    }

    return { txId, total, change };
  });

  res.json(result);
}));

app.get("/api/transactions", requireAuth, asyncRoute(async (req, res) => {
  const { from, to } = req.query;
  if (from && to) {
    const [rows] = await pool.query(
      "SELECT t.*, u.username AS cashier_name FROM transactions t LEFT JOIN users u ON u.id = t.cashier_id WHERE DATE(t.created_at) BETWEEN ? AND ? ORDER BY t.id DESC",
      [from, to]
    );
    return res.json(rows);
  }
  const [rows] = await pool.query(
    "SELECT t.*, u.username AS cashier_name FROM transactions t LEFT JOIN users u ON u.id = t.cashier_id ORDER BY t.id DESC"
  );
  res.json(rows);
}));

app.get("/api/transactions/:id/receipt", requireAuth, asyncRoute(async (req, res) => {
  const [txRows] = await pool.query("SELECT * FROM transactions WHERE id = ? LIMIT 1", [req.params.id]);
  const tx = txRows[0];
  if (!tx) return res.status(404).json({ error: "Transaction not found" });
  const [items] = await pool.query("SELECT * FROM transaction_items WHERE transaction_id = ?", [req.params.id]);
  res.json({ tx, items });
}));

app.get("/api/dashboard", requireAuth, asyncRoute(async (req, res) => {
  const [[salesRow]] = await pool.query(
    "SELECT COALESCE(SUM(total), 0) AS total FROM transactions WHERE DATE(created_at) = CURDATE()"
  );
  const [[txRow]] = await pool.query(
    "SELECT COUNT(*) AS count FROM transactions WHERE DATE(created_at) = CURDATE()"
  );
  const [[expRow]] = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE DATE(created_at) = CURDATE()"
  );
  const [lowStock] = await pool.query(
    "SELECT * FROM products WHERE stock <= ? ORDER BY stock ASC",
    [LOW_STOCK_THRESHOLD]
  );

  const todaySales = Number(salesRow.total || 0);
  const todayExpenses = Number(expRow.total || 0);

  res.json({
    todaySales,
    todayTx: Number(txRow.count || 0),
    todayExpenses,
    quickSummary: todaySales - todayExpenses,
    lowStock,
  });
}));

app.get("/api/sales-summary/daily", requireAuth, asyncRoute(async (req, res) => {
  const [rows] = await pool.query(
    "SELECT DATE(created_at) AS day, COUNT(*) AS tx_count, COALESCE(SUM(total), 0) AS total_sales FROM transactions GROUP BY DATE(created_at) ORDER BY day DESC"
  );
  res.json(rows);
}));

app.get("/api/borrowers", requireAuth, asyncRoute(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT b.id, b.name,
      COALESCE((SELECT SUM(amount) FROM utang_entries ue WHERE ue.borrower_id = b.id), 0) AS total_utang,
      COALESCE((SELECT SUM(amount) FROM utang_payments up WHERE up.borrower_id = b.id), 0) AS total_paid
    FROM borrowers b
    ORDER BY b.id DESC
  `);
  res.json(rows.map((r) => ({ ...r, balance: Number(r.total_utang) - Number(r.total_paid) })));
}));

app.post("/api/borrowers", requireAuth, asyncRoute(async (req, res) => {
  const [result] = await pool.query("INSERT INTO borrowers (name) VALUES (?)", [req.body.name]);
  res.json({ id: result.insertId });
}));

app.post("/api/borrowers/:id/utang", requireAuth, asyncRoute(async (req, res) => {
  const { description, amount } = req.body;
  await pool.query(
    "INSERT INTO utang_entries (borrower_id, description, amount) VALUES (?, ?, ?)",
    [req.params.id, description || "Utang entry", Number(amount || 0)]
  );
  res.json({ ok: true });
}));

app.post("/api/borrowers/:id/payments", requireAuth, asyncRoute(async (req, res) => {
  await pool.query(
    "INSERT INTO utang_payments (borrower_id, amount) VALUES (?, ?)",
    [req.params.id, Number(req.body.amount || 0)]
  );
  res.json({ ok: true });
}));

app.get("/api/employees", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM employees ORDER BY id DESC");
  res.json(rows);
}));

app.post("/api/employees", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const [result] = await pool.query("INSERT INTO employees (name) VALUES (?)", [req.body.name]);
  res.json({ id: result.insertId });
}));

app.post("/api/employees/:id/time-in", requireAuth, asyncRoute(async (req, res) => {
  await pool.query("INSERT INTO employee_shifts (employee_id) VALUES (?)", [req.params.id]);
  res.json({ ok: true });
}));

app.post("/api/employees/:id/time-out", requireAuth, asyncRoute(async (req, res) => {
  await pool.query(
    "UPDATE employee_shifts SET time_out = CURRENT_TIMESTAMP WHERE employee_id = ? AND time_out IS NULL",
    [req.params.id]
  );
  res.json({ ok: true });
}));

app.get("/api/shifts", requireAuth, asyncRoute(async (req, res) => {
  const [rows] = await pool.query(
    "SELECT s.*, e.name AS employee_name FROM employee_shifts s JOIN employees e ON e.id = s.employee_id ORDER BY s.id DESC LIMIT 100"
  );
  res.json(rows);
}));

app.get("/api/expenses", requireAuth, asyncRoute(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM expenses ORDER BY id DESC");
  const [[totRow]] = await pool.query("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses");
  res.json({ rows, total: Number(totRow.total || 0) });
}));

app.post("/api/expenses", requireAuth, asyncRoute(async (req, res) => {
  await pool.query(
    "INSERT INTO expenses (description, amount) VALUES (?, ?)",
    [req.body.description, Number(req.body.amount || 0)]
  );
  res.json({ ok: true });
}));

app.delete("/api/expenses/:id", requireAuth, asyncRoute(async (req, res) => {
  await pool.query("DELETE FROM expenses WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
}));

async function start() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`Simple POS running at http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
