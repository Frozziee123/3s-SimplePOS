# Simple POS System

Web-based POS system with MySQL database (phpMyAdmin compatible).

## Features Included

- Admin and Cashier login
- POS cashier flow: cart, quantity change, discount, cash payment, change, receipt view, void item
- Inventory management: add/edit/delete products, stock tracking, low stock indicator
- Sales and reports: daily summary, transaction list, receipt history, date filtering
- Utang (credit): borrower list, utang entries, partial/full payment tracking, remaining balance
- Employee management: add employee, time in/out, shift history
- Expenses: add/delete expense, total expenses
- Dashboard: today's sales, transaction count, low stock alerts, quick summary

## Tech Stack

- Node.js + Express
- MySQL (`mysql2`)
- Vanilla HTML/CSS/JS frontend

## Setup (phpMyAdmin + MySQL)

1. Make sure MySQL server is running (XAMPP/WAMP/etc).
2. Create `.env` file in project root (copy from `.env.example`) and set your DB credentials.
3. Optional manual phpMyAdmin import:
   - Open phpMyAdmin
   - Import `database.sql`
4. Install and run:
   - `npm install`
   - `npm start`
5. Open [http://localhost:3000](http://localhost:3000)

## Default Accounts

- Admin: `admin` / `admin123`
- Cashier: `cashier` / `cashier123`
- Customer: `customer` / `customer123`

## Notes

- Database and tables are auto-created on first run.
- `database.sql` is included for manual import in phpMyAdmin.
- This is a practical starter version. Passwords are stored in plain text for simplicity and should be hashed in production.
