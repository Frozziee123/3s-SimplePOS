let token = localStorage.getItem("pos_token") || "";
let me = JSON.parse(localStorage.getItem("pos_user") || "null");
let products = [];
let cart = [];

async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function peso(n) {
  return `PHP ${Number(n || 0).toFixed(2)}`;
}

async function login() {
  try {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const data = await api("/api/login", "POST", { username, password });
    token = data.token;
    me = data.user;
    localStorage.setItem("pos_token", token);
    localStorage.setItem("pos_user", JSON.stringify(me));
    const loginPage = document.getElementById("loginPage");
    const appPage = document.getElementById("app");
    if (loginPage && appPage) {
      loginPage.classList.add("hidden");
      appPage.classList.remove("hidden");
      document.getElementById("whoami").textContent = `${me.username} (${me.role})`;
      if (me.role === 'admin') {
        const navUsers = document.getElementById('nav-users');
        if (navUsers) navUsers.style.display = 'block';
      }
      // Hide nav buttons based on role
      const navButtons = document.querySelectorAll('.nav-btn');
      navButtons.forEach(btn => {
        if (me.role === 'customer') {
          if (!['nav-dashboard', 'nav-sales'].includes(btn.id)) {
            btn.style.display = 'none';
          }
        } else if (me.role === 'cashier') {
          if (['nav-users', 'nav-employees', 'nav-expenses'].includes(btn.id)) {
            btn.style.display = 'none';
          }
        }
      });
      showTab("dashboard");
      await loadAll();
    } else {
      window.location.href = "/app.html";
    }
  } catch (e) {
    alert(e.message);
  }
}

async function logout() {
  try {
    if (token) await api("/api/logout", "POST");
  } catch (e) {
    // Ignore logout API failures and clear local session anyway.
  }
  token = "";
  me = null;
  localStorage.removeItem("pos_token");
  localStorage.removeItem("pos_user");
  cart = [];
  products = [];
  const loginPage = document.getElementById("loginPage");
  const appPage = document.getElementById("app");
  if (loginPage && appPage) {
    appPage.classList.add("hidden");
    loginPage.classList.remove("hidden");
  } else {
    window.location.href = "/login.html";
  }
}

function showTab(tab) {
  document.querySelectorAll(".tabview").forEach((x) => x.classList.add("hidden"));
  document.getElementById(tab).classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.remove("active"));
  const nav = document.getElementById(`nav-${tab}`);
  if (nav) nav.classList.add("active");
  if (tab === 'users') loadUsers();
}

function cartTotal() {
  return cart.reduce((a, b) => a + b.qty * b.price, 0);
}

async function loadDashboard() {
  const d = await api("/api/dashboard");
  document.getElementById("dashboard").innerHTML = `
    <h3 class="section-title">Dashboard</h3>
    <div class="muted">Store overview and alerts</div>
    <div class="grid">
      <div class="kpi">
        <div><div class="label">TODAY'S SALES</div><div class="value">${peso(d.todaySales)}</div></div>
        <div class="kpi-icon kpi-sales">₱</div>
      </div>
      <div class="kpi">
        <div><div class="label">TRANSACTIONS</div><div class="value">${d.todayTx}</div></div>
        <div class="kpi-icon kpi-tx">🧾</div>
      </div>
      <div class="kpi">
        <div><div class="label">EXPENSES</div><div class="value">${peso(d.todayExpenses)}</div></div>
        <div class="kpi-icon kpi-exp">💸</div>
      </div>
      <div class="kpi">
        <div><div class="label">QUICK SUMMARY</div><div class="value">${peso(d.quickSummary)}</div></div>
        <div class="kpi-icon kpi-sum">📊</div>
      </div>
    </div>
    <h4>Low Stock Alert</h4>
    <table><tr><th>Product</th><th>Stock</th></tr>
      ${d.lowStock.map((p) => `<tr><td>${p.name}</td><td class="danger">${p.stock}</td></tr>`).join("") || "<tr><td colspan='2'>No low stock items.</td></tr>"}
    </table>
  `;
}

async function loadInventory() {
  products = await api("/api/products");
  document.getElementById("inventory").innerHTML = `
    <h3 class="section-title">Inventory / Stock</h3>
    <div class="mini">Product list, stock, and actions</div>
    ${me.role === "admin" ? `
      <div class="inline-row">
        <input id="pName" placeholder="Product name" />
        <input id="pPrice" type="number" placeholder="Price" />
        <input id="pStock" type="number" placeholder="Stock" />
        <button onclick="addProduct()">+ Add Product</button>
      </div>
    ` : "<p>Cashier view only.</p>"}
    <table>
      <tr><th>ID</th><th>Name</th><th>Price</th><th>Stock</th><th>Actions</th></tr>
      ${products.map((p) => `
        <tr>
          <td>${p.id}</td>
          <td>${p.name}</td>
          <td>${peso(p.price)}</td>
          <td class="${p.stock <= 5 ? "danger" : "ok"}">${p.stock}</td>
          <td>
            ${me.role === "admin" ? `
              <span class="action-group">
                <button class="btn-warning" onclick="editProduct(${p.id})">Edit</button>
                <button class="btn-danger" onclick="deleteProduct(${p.id})">Delete</button>
              </span>
            ` : ""}
          </td>
        </tr>
      `).join("")}
    </table>
  `;
}

async function addProduct() {
  try {
    const name = document.getElementById("pName").value.trim();
    const price = Number(document.getElementById("pPrice").value || 0);
    const stock = Number(document.getElementById("pStock").value || 0);
    if (!name) return alert("Product name is required.");
    await api("/api/products", "POST", { name, price, stock });
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
}

async function editProduct(id) {
  try {
    const p = products.find((x) => x.id === id);
    const name = prompt("Name", p.name);
    if (name === null) return;
    const price = prompt("Price", p.price);
    if (price === null) return;
    const stock = prompt("Stock", p.stock);
    if (stock === null) return;
    await api(`/api/products/${id}`, "PUT", { name, price, stock });
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteProduct(id) {
  if (!confirm("Delete this product?")) return;
  try {
    await api(`/api/products/${id}`, "DELETE");
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
}

async function loadPOS() {
  const options = products
    .map((p) => `<option value="${p.id}">${p.name} (${peso(p.price)}) stock:${p.stock}</option>`)
    .join("");
  const productRows = products
    .map(
      (p) => `<tr>
        <td>${p.name}</td>
        <td>${peso(p.price)}</td>
        <td class="${p.stock <= 5 ? "danger" : "ok"}">${p.stock}</td>
        <td><button onclick="quickAdd(${p.id})">+ Add</button></td>
      </tr>`
    )
    .join("");
  document.getElementById("pos").innerHTML = `
    <h3 class="section-title">POS / Cashier</h3>
    <div class="module-grid">
      <div class="panel">
        <h4>Products</h4>
        <div class="inline-row">
          <select id="cartProductId">${options}</select>
          <input id="cartQty" type="number" value="1" min="1" />
          <button onclick="addToCart()">Add Item</button>
        </div>
        <table>
          <tr><th>Product</th><th>Price</th><th>Stock</th><th>Action</th></tr>
          ${productRows || "<tr><td colspan='4'>No products yet.</td></tr>"}
        </table>
      </div>
      <div class="panel">
        <h4>Cart</h4>
        <table><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th><th>Action</th></tr>
          ${cart.map((i, idx) => `
            <tr>
              <td>${i.name}</td>
              <td><input type="number" min="1" value="${i.qty}" onchange="changeQty(${idx}, this.value)" /></td>
              <td>${peso(i.price)}</td>
              <td>${peso(i.qty * i.price)}</td>
              <td><button class="btn-danger" onclick="voidItem(${idx})">Remove</button></td>
            </tr>`).join("") || "<tr><td colspan='5'>Cart is empty.</td></tr>"}
        </table>
        <p>Subtotal: <b>${peso(cartTotal())}</b></p>
        <div class="inline-row">
          <input id="discount" type="number" placeholder="Discount" value="0" />
          <input id="cash" type="number" placeholder="Cash" value="0" />
          <button class="btn-success" onclick="checkout()">Checkout</button>
        </div>
      </div>
    </div>
    <div id="receiptView"></div>
  `;
}

function quickAdd(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  const existing = cart.find((x) => x.product_id === id);
  if (existing) existing.qty += 1;
  else cart.push({ product_id: id, name: p.name, price: p.price, qty: 1 });
  loadPOS();
}

function addToCart() {
  if (!products.length) return alert("No products available.");
  const id = Number(document.getElementById("cartProductId").value);
  const qty = Number(document.getElementById("cartQty").value || 1);
  const p = products.find((x) => x.id === id);
  if (!p) return alert("Please select a valid product.");
  if (qty <= 0) return alert("Quantity must be greater than zero.");
  const existing = cart.find((x) => x.product_id === id);
  if (existing) existing.qty += qty;
  else cart.push({ product_id: id, name: p.name, price: p.price, qty });
  loadPOS();
}

function changeQty(index, qty) {
  cart[index].qty = Number(qty || 1);
  loadPOS();
}

function voidItem(index) {
  cart.splice(index, 1);
  loadPOS();
}

async function checkout() {
  try {
    const discount = Number(document.getElementById("discount").value || 0);
    const cash = Number(document.getElementById("cash").value || 0);
    const result = await api("/api/transactions", "POST", {
      items: cart.map((c) => ({ product_id: c.product_id, qty: c.qty })),
      discount,
      cash,
    });
    const receipt = await api(`/api/transactions/${result.txId}/receipt`);
    document.getElementById("receiptView").innerHTML = `
      <h4>Receipt #${result.txId}</h4>
      <pre>${receipt.items.map((i) => `${i.name_snapshot} x${i.qty} = ${peso(i.subtotal)}`).join("\n")}
Total: ${peso(receipt.tx.total)}
Discount: ${peso(receipt.tx.discount)}
Cash: ${peso(receipt.tx.cash)}
Change: ${peso(receipt.tx.change)}</pre>
      <button class="btn-muted" onclick="window.print()">Print View</button>
    `;
    cart = [];
    await loadAll();
    showTab("pos");
  } catch (e) {
    alert(e.message);
  }
}

async function loadSales() {
  const tx = await api("/api/transactions");
  const daily = await api("/api/sales-summary/daily");
  document.getElementById("sales").innerHTML = `
    <h3 class="section-title">Sales / Reports</h3>
    <div class="inline-row">
      <input id="fromDate" type="date" />
      <input id="toDate" type="date" />
      <button onclick="filterTransactions()">Filter by Date</button>
      <button class="btn-muted" onclick="window.print()">Export</button>
    </div>
    <h4>Daily Sales Summary</h4>
    <table><tr><th>Date</th><th>Transactions</th><th>Total</th></tr>
      ${daily.map((d) => `<tr><td>${d.day}</td><td>${d.tx_count}</td><td>${peso(d.total_sales)}</td></tr>`).join("")}
    </table>
    <h4>Transaction List / Receipt History</h4>
    <div id="txTable">
      ${renderTxTable(tx)}
    </div>
  `;
}

function renderTxTable(tx) {
  return `
    <table><tr><th>ID</th><th>Date</th><th>Total</th><th>Cashier</th><th>Receipt</th></tr>
      ${tx.map((t) => `<tr>
        <td>${t.id}</td><td>${t.created_at}</td><td>${peso(t.total)}</td><td>${t.cashier_name || "-"}</td>
        <td><button class="btn-muted" onclick="viewReceipt(${t.id})">View</button></td>
      </tr>`).join("")}
    </table>
    <div id="receiptHistory"></div>
  `;
}

async function filterTransactions() {
  try {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    if ((from && !to) || (!from && to)) {
      return alert("Please provide both From and To dates.");
    }
    const tx = await api(`/api/transactions?from=${from}&to=${to}`);
    document.getElementById("txTable").innerHTML = renderTxTable(tx);
  } catch (e) {
    alert(e.message);
  }
}

async function viewReceipt(id) {
  try {
    const r = await api(`/api/transactions/${id}/receipt`);
    document.getElementById("receiptHistory").innerHTML = `
      <h4>Receipt #${id}</h4>
      <pre>${r.items.map((i) => `${i.name_snapshot} x${i.qty} = ${peso(i.subtotal)}`).join("\n")}
Total: ${peso(r.tx.total)} | Discount: ${peso(r.tx.discount)} | Cash: ${peso(r.tx.cash)} | Change: ${peso(r.tx.change)}</pre>
    `;
  } catch (e) {
    alert(e.message);
  }
}

async function loadUtang() {
  const rows = await api("/api/borrowers");
  document.getElementById("utang").innerHTML = `
    <h3 class="section-title">Utang / Credit</h3>
    <div class="inline-row">
      <input id="borrowerName" placeholder="Borrower name" />
      <button onclick="addBorrower()">+ Add Borrower</button>
    </div>
    <table><tr><th>ID</th><th>Name</th><th>Total Utang</th><th>Total Paid</th><th>Balance</th><th>Actions</th></tr>
      ${rows.map((b) => `<tr>
        <td>${b.id}</td><td>${b.name}</td><td>${peso(b.total_utang)}</td><td>${peso(b.total_paid)}</td><td>${peso(b.balance)}</td>
        <td>
          <span class="action-group">
            <button class="btn-warning" onclick="addUtang(${b.id})">Add Utang</button>
            <button class="btn-muted" onclick="addPayment(${b.id})">View / Pay</button>
          </span>
        </td>
      </tr>`).join("")}
    </table>
  `;
}

async function addBorrower() {
  try {
    const name = document.getElementById("borrowerName").value.trim();
    if (!name) return alert("Borrower name is required.");
    await api("/api/borrowers", "POST", { name });
    await loadUtang();
  } catch (e) {
    alert(e.message);
  }
}

async function addUtang(id) {
  const description = prompt("Description");
  if (description === null) return;
  const amount = prompt("Amount");
  if (amount === null) return;
  try {
    await api(`/api/borrowers/${id}/utang`, "POST", { description, amount });
    await loadUtang();
  } catch (e) {
    alert(e.message);
  }
}

async function addPayment(id) {
  const amount = prompt("Payment amount");
  if (amount === null) return;
  try {
    await api(`/api/borrowers/${id}/payments`, "POST", { amount });
    await loadUtang();
  } catch (e) {
    alert(e.message);
  }
}

async function loadEmployees() {
  if (me.role !== "admin") {
    document.getElementById("employees").innerHTML = "<h3 class='section-title'>Employees</h3><p>Admin only section.</p>";
    return;
  }
  const employees = await api("/api/employees");
  const shifts = await api("/api/shifts");
  document.getElementById("employees").innerHTML = `
    <h3 class="section-title">Employee Management</h3>
    <div class="inline-row">
      <input id="empName" placeholder="Employee name" />
      <button onclick="addEmployee()">+ Add Employee</button>
    </div>
    <h4>Employee List</h4>
    <table><tr><th>ID</th><th>Name</th><th>Actions</th></tr>
      ${employees.map((e) => `<tr>
        <td>${e.id}</td>
        <td>${e.name}</td>
        <td><span class="action-group"><button class="btn-success" onclick="timeIn(${e.id})">Time In</button> <button class="btn-warning" onclick="timeOut(${e.id})">Time Out</button></span></td>
      </tr>`).join("")}
    </table>
    <h4>Shift History</h4>
    <table><tr><th>Employee</th><th>Time In</th><th>Time Out</th></tr>
      ${shifts.map((s) => `<tr><td>${s.employee_name}</td><td>${s.time_in}</td><td>${s.time_out || "-"}</td></tr>`).join("")}
    </table>
  `;
}

async function addEmployee() {
  try {
    const name = document.getElementById("empName").value.trim();
    if (!name) return alert("Employee name is required.");
    await api("/api/employees", "POST", { name });
    await loadEmployees();
  } catch (e) {
    alert(e.message);
  }
}

async function timeIn(id) {
  try {
    await api(`/api/employees/${id}/time-in`, "POST");
    await loadEmployees();
  } catch (e) {
    alert(e.message);
  }
}

async function timeOut(id) {
  try {
    await api(`/api/employees/${id}/time-out`, "POST");
    await loadEmployees();
  } catch (e) {
    alert(e.message);
  }
}

async function loadExpenses() {
  const { rows, total } = await api("/api/expenses");
  document.getElementById("expenses").innerHTML = `
    <h3 class="section-title">Expenses</h3>
    <div class="inline-row">
      <input id="expDesc" placeholder="Expense description" />
      <input id="expAmount" type="number" placeholder="Amount" />
      <button onclick="addExpense()">+ Add Expense</button>
    </div>
    <p><b>Total Expenses:</b> ${peso(total)}</p>
    <table><tr><th>ID</th><th>Description</th><th>Amount</th><th>Date</th><th>Action</th></tr>
      ${rows.map((e) => `<tr><td>${e.id}</td><td>${e.description}</td><td>${peso(e.amount)}</td><td>${e.created_at}</td><td><button class="btn-danger" onclick="deleteExpense(${e.id})">Delete</button></td></tr>`).join("")}
    </table>
  `;
}

async function addExpense() {
  try {
    const description = document.getElementById("expDesc").value.trim();
    const amount = Number(document.getElementById("expAmount").value || 0);
    if (!description) return alert("Expense description is required.");
    await api("/api/expenses", "POST", { description, amount });
    await loadExpenses();
    await loadDashboard();
  } catch (e) {
    alert(e.message);
  }
}
async function loadUsers() {
  if (me.role !== "admin") {
    document.getElementById("users").innerHTML = "<h3 class='section-title'>Users</h3><p>Admin only section.</p>";
    return;
  }
  const users = await api("/api/users");
  document.getElementById("users").innerHTML = `
    <h3 class="section-title">User Management</h3>
    <div class="inline-row">
      <input id="userUsername" placeholder="Username" />
      <input id="userPassword" type="password" placeholder="Password" />
      <select id="userRole"><option value="cashier">Cashier</option><option value="admin">Admin</option><option value="customer">Customer</option></select>
      <button onclick="addUser()">+ Add User</button>
    </div>
    <h4>User List</h4>
    <table><tr><th>Username</th><th>Role</th><th>Actions</th></tr>
      ${users.map((u) => `<tr>
        <td>${u.username}</td>
        <td>${u.role}</td>
        <td><span class="action-group"><button class="btn-warning" onclick="editUser(${u.id}, '${u.username}', '${u.role}')">Edit</button> <button class="btn-danger" onclick="deleteUser(${u.id})">Delete</button></span></td>
      </tr>`).join("")}
    </table>
  `;
}

async function addUser() {
  try {
    const username = document.getElementById("userUsername").value.trim();
    const password = document.getElementById("userPassword").value.trim();
    const role = document.getElementById("userRole").value;
    if (!username || !password) return alert("Username and password are required.");
    await api("/api/users", "POST", { username, password, role });
    await loadUsers();
  } catch (e) {
    alert(e.message);
  }
}

async function editUser(id, oldUsername, oldRole) {
  const username = prompt("New username:", oldUsername);
  const password = prompt("New password (leave empty to keep current):", "");
  const role = prompt("New role (admin/cashier):", oldRole);
  if (!username || !role) return;
  try {
    await api(`/api/users/${id}`, "PUT", { username, password: password || undefined, role });
    await loadUsers();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteUser(id) {
  if (!confirm("Delete this user?")) return;
  try {
    await api(`/api/users/${id}`, "DELETE");
    await loadUsers();
  } catch (e) {
    alert(e.message);
  }
}
async function deleteExpense(id) {
  try {
    await api(`/api/expenses/${id}`, "DELETE");
    await loadExpenses();
    await loadDashboard();
  } catch (e) {
    alert(e.message);
  }
}

async function loadAll() {
  await loadInventory();
  await loadPOS();
  await loadSales();
  await loadUtang();
  await loadEmployees();
  await loadExpenses();
  await loadDashboard();
}

async function initPage() {
  const loginPage = document.getElementById("loginPage");
  const appPage = document.getElementById("app");
  const singleUrlMode = Boolean(loginPage && appPage);

  if (singleUrlMode) {
    if (!token || !me) {
      appPage.classList.add("hidden");
      loginPage.classList.remove("hidden");
      return;
    }
    loginPage.classList.add("hidden");
    appPage.classList.remove("hidden");
    document.getElementById("whoami").textContent = `${me.username} (${me.role})`;
    showTab("dashboard");
    try {
      await loadAll();
    } catch (e) {
      alert(e.message || "Failed to load POS data.");
    }
    return;
  }

  if (loginPage) {
    if (token && me) {
      window.location.href = "/app.html";
    }
    return;
  }

  if (appPage) {
    if (!token || !me) {
      window.location.href = "/login.html";
      return;
    }
    document.getElementById("whoami").textContent = `${me.username} (${me.role})`;
    showTab("dashboard");
    try {
      await loadAll();
    } catch (e) {
      alert(e.message || "Failed to load POS data.");
    }
  }
}

initPage();
