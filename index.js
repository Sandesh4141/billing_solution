import express from "express";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  port: 5432,
  password: "4141",
  database: "billing_db",
});

// Connect to the database
db.connect(err => {
  if (err) {
    console.error("Connection error", err.stack);
  } else {
    console.log("Connected to database");
  }
});

// Function to handle database queries
const queryDatabase = async (query, params) => {
  try {
    const result = await db.query(query, params);
    return result;
  } catch (err) {
    console.error("Database query error", err);
    throw err; // Rethrow to handle in middleware
  }
};

// Middleware for handling errors
const errorHandler = (err, req, res, next) => {
  console.error(err);
  res.status(500).send("Internal Server Error");
};

// Home route
app.get("/", async (req, res) => {
  try {
    // Calculate total sales
    const totalSalesResult = await queryDatabase('SELECT COUNT(*) AS total_sales FROM billings');
    const totalSales = totalSalesResult.rows[0].total_sales;

    // Calculate total revenue
    const totalRevenueResult = await queryDatabase('SELECT SUM(total_amount) AS total_revenue FROM billings');
    const totalRevenue = totalRevenueResult.rows[0].total_revenue || 0; // Default to 0 if no sales

    res.render("index", { totalSales, totalRevenue }); // Render index view
  } catch (err) {
    next(err); // Pass the error to the error handler
  }
});

// Customer Routes
app.get("/customers/add", (req, res) => {
  res.render("add-customer");
});

app.post("/customers/add", async (req, res, next) => {
  const { name, gender, contact, email } = req.body;
  try {
    await queryDatabase("INSERT INTO customers (name, gender, contact, email) VALUES ($1, $2, $3, $4)", [name, gender, contact, email]);
    res.redirect("/customers/view");
  } catch (err) {
    next(err);
  }
});

app.get("/customers/view", async (req, res, next) => {
  try {
    const customers = await queryDatabase("SELECT * FROM customers");
    res.render("view-customers", { customers: customers.rows });
  } catch (err) {
    next(err);
  }
});

app.get("/customers/edit/:id", async (req, res, next) => {
  const customerId = req.params.id;
  try {
    const customerResult = await queryDatabase("SELECT * FROM customers WHERE id = $1", [customerId]);
    if (customerResult.rows.length > 0) {
      const customer = customerResult.rows[0];
      res.render("edit-customer", { customer });
    } else {
      res.status(404).send("Customer not found");
    }
  } catch (err) {
    next(err);
  }
});

app.post("/customers/edit/:id", async (req, res, next) => {
  const customerId = req.params.id;
  const { name, gender, contact, email } = req.body;
  try {
    await queryDatabase("UPDATE customers SET name = $1, gender = $2, contact = $3, email = $4 WHERE id = $5", [name, gender, contact, email, customerId]);
    res.redirect("/customers/view");
  } catch (err) {
    next(err);
  }
});

app.post("/customers/delete/:id", async (req, res, next) => {
  const customerId = req.params.id;
  try {
    await queryDatabase("DELETE FROM customers WHERE id = $1", [customerId]);
    res.redirect("/customers/view");
  } catch (err) {
    next(err);
  }
});

// Product Routes
app.get("/products/add", (req, res) => {
  res.render("add-product");
});

app.post("/products/add", async (req, res, next) => {
  const { name, price, quantity, brand, supplier, oldStock, category } = req.body;
  try {
    await queryDatabase("INSERT INTO products (name, price, quantity, brand, supplier, old_stock, category) VALUES ($1, $2, $3, $4, $5, $6, $7)", [name, price, quantity, brand, supplier, oldStock, category]);
    res.redirect("/products/view");
  } catch (err) {
    next(err);
  }
});

app.get("/products/view", async (req, res, next) => {
  try {
    const products = await queryDatabase("SELECT * FROM products");
    res.render("view-products", { products: products.rows });
  } catch (err) {
    next(err);
  }
});

app.get("/products/edit/:id", async (req, res, next) => {
  const productId = req.params.id;
  try {
    const productResult = await queryDatabase("SELECT * FROM products WHERE id = $1", [productId]);
    if (productResult.rows.length > 0) {
      const product = productResult.rows[0];
      res.render("edit-product", { product });
    } else {
      res.status(404).send("Product not found");
    }
  } catch (err) {
    next(err);
  }
});

app.post("/products/edit/:id", async (req, res, next) => {
  const productId = req.params.id;
  const { name, price, quantity, brand, supplier, oldStock, category } = req.body;
  try {
    await queryDatabase("UPDATE products SET name = $1, price = $2, quantity = $3, brand = $4, supplier = $5, old_stock = $6, category = $7 WHERE id = $8", [name, price, quantity, brand, supplier, oldStock, category, productId]);
    res.redirect("/products/view");
  } catch (err) {
    next(err);
  }
});

app.get("/products/delete/:id", async (req, res, next) => {
  const productId = req.params.id;
  try {
    await queryDatabase("DELETE FROM products WHERE id = $1", [productId]);
    res.redirect("/products/view");
  } catch (err) {
    next(err);
  }
});

// Billing Routes
app.get("/billing/add", async (req, res, next) => {
  try {
    const customers = await queryDatabase("SELECT * FROM customers");
    const products = await queryDatabase("SELECT * FROM products");
    res.render("billing", { customers: customers.rows, products: products.rows });
  } catch (err) {
    next(err);
  }
});

app.post("/billing/add", async (req, res, next) => {
  const { customer, products } = req.body; // Get customer ID and selected product IDs from form

  // Ensure products is an array
  const productIds = Array.isArray(products) ? products : [products];

  // Initialize total amount
  let totalAmount = 0;

  try {
    // Insert the billing record into the database
    const billingResult = await queryDatabase("INSERT INTO billings (customer_id, total_amount) VALUES ($1, $2) RETURNING id", [customer, totalAmount]);
    const billingId = billingResult.rows[0].id;

    // Link products to the billing in the billing_products table
    for (const productId of productIds) {
      const quantity = req.body[`quantity-${productId}`]; // Get quantity for this product
      const productPriceResult = await queryDatabase("SELECT price FROM products WHERE id = $1", [productId]);

      // Check if the product exists
      if (productPriceResult.rows.length > 0) {
        const productPrice = productPriceResult.rows[0].price;

        // Calculate the total amount
        totalAmount += parseFloat(productPrice) * parseInt(quantity); // Add to total amount

        // Insert product and quantity into billing_products table
        await queryDatabase("INSERT INTO billing_products (billing_id, product_id, quantity) VALUES ($1, $2, $3)", [billingId, productId, quantity]);
      } else {
        console.error(`Product with ID ${productId} not found`);
      }
    }

    // Update the total amount in the billings table
    await queryDatabase("UPDATE billings SET total_amount = $1 WHERE id = $2", [totalAmount, billingId]);
    res.redirect("/billing/view"); // Redirect to the view billing page after saving
  } catch (err) {
    next(err);
  }
});

// View Billings route
app.get("/billing/view", async (req, res, next) => {
  try {
      const billings = await queryDatabase(`SELECT b.id, c.name AS customer_name, b.total_amount, b.date FROM billings b JOIN customers c ON b.customer_id = c.id`);
      res.render("view-billing", { billings: billings.rows });
  } catch (err) {
      next(err);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Internal Server Error");
});

// Start the server
app.listen(3000, () => {
  console.log("App Started At localhost:3000");
});
