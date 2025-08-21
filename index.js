require("dotenv").config();

let express = require("express");

let app = express();

let path = require("path");

const port = process.env.PORT || 5003;

let security = false;

let hiddenSubmit = "hidden";

let hiddenView = "";

app.set("view engine", "ejs");

app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({extended: true}));

app.use(express.static(path.join(__dirname, 'images')));

app.use('/styles', express.static(path.join(__dirname, 'styles')));
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/js', express.static(path.join(__dirname, 'node_modules', 'bootstrap', 'dist', 'js')));

const knex = require("knex")({
  client: "pg",
  connection: {
    host: process.env.RDS_HOSTNAME || "localhost",
    user: process.env.RDS_USERNAME || "postgres",
    password: process.env.RDS_PASSWORD || "alswindows",
    database: process.env.RDS_DB_NAME || "als-windows",
    port: process.env.RDS_PORT || 5432,
    ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : false
  },
  pool: {
    min: 0,
    max: 2,                           // keep tiny (RDS micro/small)
    acquireTimeoutMillis: 10000,      // 10s wait to get a client
    createTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,         // release idle clients faster
    reapIntervalMillis: 1000,
    afterCreate: (conn, done) => {
      // keep slow queries from hogging the pool
      conn.query('SET statement_timeout TO 15000; SET idle_in_transaction_session_timeout TO 5000;', err => {
        done(err, conn);
      });
    }
  }
});

app.get('/db-ping', async (_, res) => {
  try {
    const r = await knex.raw('select 1 as ok');
    res.send(r.rows || 'ok');
  } catch (e) {
    console.error(e);
    res.status(500).send(e.message);
  }
});









// get rout for home page
app.get("/", (req, res) => {
    res.render("index", { security, navPage: 'home' }); 
});

// get route for calculator page
app.get('/calculator', (req, res) => {
    res.render('calculator', {security, navPage: 'calculator'});
});

// get route for about us
app.get('/aboutUs', (req, res) => {
    res.render('aboutUs', {security, navPage: 'about'});
});

// get route for leads
app.get('/leads', (req, res) => {
    res.render('leads', {security, navPage: 'leads'});
});


// post route for leads
app.post('/leads', (req, res) => {
    knex("leads").insert({
        lead_first_name: req.body.lead_first_name,
        lead_last_name: req.body.lead_last_name,
        lead_phone: req.body.lead_phone,
        lead_email: req.body.lead_email,
        method_obtained: "website",
        type_of_service: req.body.type_of_service,
        notes: req.body.notes,
    }).then(mylead => {
        // Send success response back to the client
        res.redirect("/submission")
    }).catch(error => {
        // Handle any errors
        res.status(500).json({ error: "An error occurred while processing your request." });
    });
});

// Route to render login.ejs for /login
app.get('/login', (req, res) => {
    res.render('login', {security, navPage: 'login'}); // Ensure login.ejs is in the views folder
});


app.post('/login', async (req, res) => {
    const emp_username = req.body.emp_username;
    const emp_password = req.body.emp_password;

    console.log("Trying login with:", emp_username);

    try {
        // Query the login_info table
        const user = await knex('login_info')
            .select('*')
            .where({ emp_username, emp_password }) // ⚠️ plain-text check, OK for dev
            .first();

        console.log("DB Result:", user);

        if (user) {
            security = true;
            res.redirect("/customerManagement");
        } else {
            security = false;
            res.status(401).send("Invalid username or password");
        }

    } catch (error) {
        console.error("Database query failed:", error);
        res.status(500).send("Database query failed: " + error.message);
    }
});

// get method for logging out
app.get('/logout', (req, res) => {
    security = false;  // flip off employee mode
    res.redirect('/'); // go through your normal home route
});

// get route to view all customers
app.get('/customerManagement', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; // Default to page 1
        const limit = 15; // Show 15 customers per page
        const offset = (page - 1) * limit; // Calculate offset for the database query

        // Fetch the total number of customers for pagination
        const totalCustomers = await knex("customers").count('* as count').first();
        const totalPages = Math.ceil(totalCustomers.count / limit);

        hiddenSubmit = "hidden";
        hiddenView = "";

        // Fetch the customers for the current page
       const customers = await knex("customers")
        .leftJoin('customer_status', 'customer_status.cust_status_id', '=', 'customers.cust_status_id')
        .select(
            "customers.cust_id",
            "customers.cust_first_name",
            "customers.cust_last_name",
            "customers.quote_price",
            "customers.cust_street_address",
            "customers.cust_city",
            "customers.cust_state",
            "customers.cust_zip",
            "customers.cust_phone",
            "customers.cust_email",
            "customer_status.status_description"
        )
        .limit(limit)
        .offset(offset);


        // Render the page
        res.render('customerManagement', { customers, currentPage: page, totalPages, navPage: 'customers', security, hiddenView, hiddenSubmit, noResults: false, query: '' });
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).send("Error fetching data.");
    }
});
  

// get route for the /editCustomer action
app.get('/editCustomer/:id', (req, res) => {
    let id = req.params.id;
    // Query the Customer by ID first
    knex('customers')
      .where('cust_id', id)
      .first()
      .then(customerRec => {
        if (!customerRec) {
          return res.status(404).send('customer not found');
        }
        // Query all Customers
        knex('customers')
          .select("*")
          .then(customer => {
            // Render the edit form and pass both customer record and customer array
            res.render('editCustomer', { customerRec, customer, security, navPage: 'customers' });
          })
          .catch(error => {
            console.error('Error fetching whole query of customer types:', error);
            res.status(500).send('Internal Server Error, Error fetching whole query of customer types');
          });
      })
      .catch(error => {
        console.error('Error fetching the individual customer for editing:', error);
        res.status(500).send('Internal Server Error, Error fetching the individual customer for editing');
      });
  });

// post route to edit customer
app.post("/editCustomer/:id", (req,res) =>{
    knex("customers").where("cust_id", parseInt(req.params.id)).update({
        cust_first_name: req.body.cust_first_name,
        cust_last_name: req.body.cust_last_name,
        quote_price: req.body.quote_price,
        cust_street_address: req.body.cust_street_address,
        cust_city: req.body.cust_city,
        cust_state: req.body.cust_state,
        cust_zip: req.body.cust_zip,
        cust_phone: req.body.cust_phone,
        cust_email: req.body.cust_email,
        cust_status_id: req.body.cust_status_id
    }).then(customer => {
        res.redirect("/customerManagement");
    });
});

// get route to add customer
app.get("/addCustomer/", (req, res) => {
    res.render("addCustomer", { security, navPage: 'customers' });
});

// post route to add customer
app.post("/addCustomer", (req,res) => {
    knex("customers").insert({
        cust_first_name: req.body.cust_first_name,
        cust_last_name: req.body.cust_last_name,
        quote_price: req.body.quote_price,
        cust_street_address: req.body.cust_street_address,
        cust_city: req.body.cust_city,
        cust_state: req.body.cust_state,
        cust_zip: req.body.cust_zip,
        cust_phone: req.body.cust_phone,
        cust_email: req.body.cust_email,
        notes: req.body.notes
    }).then(mycustomer => {
        res.redirect("/customerManagement");
    });
});

// get route to return back to home page
app.get("/returnHome/", (req, res) => {
    res.render("index", { security, navPage: 'home' });
});




// post route to delete customer
app.post("/deleteCustomer/:id", (req,res) => {
    knex("customers").where("cust_id", req.params.id).del().then(customer =>{
        res.redirect("/customerManagement");
    }).catch(err => {
        console.log(err)
        res.status(500).json({err});
    });
});

// get route to view all leads
app.get('/leadManagement', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; // Default to page 1
        const limit = 15; // Show 15 customers per page
        const offset = (page - 1) * limit; // Calculate offset for the database query

        // Fetch the total number of customers for pagination
        const totalCustomers = await knex("leads").count('* as count').first();
        const totalPages = Math.ceil(totalCustomers.count / limit);

        hiddenSubmit = "hidden";
        hiddenView = "";

        // Fetch the customers for the current page
        const leads = await knex("leads")
            .select(
                "lead_id",
                "lead_first_name",
                "lead_last_name",
                "method_obtained",
                "lead_street_address",
                "lead_city",
                "lead_state",
                "lead_phone",
                "lead_email"
            )
            .limit(limit)
            .offset(offset);

        // Render the page
        res.render('leadManagement', { leads, currentPage: page, totalPages, navPage: 'leads', security, hiddenSubmit, hiddenView, noResults: false, query: ''});
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).send("Error fetching data.");
    }
});

// get route to add lead
app.get("/addLead/", (req, res) => {
    res.render("addLead", { security, navPage: 'leads' });
});


// post route to add lead
app.post("/addLead", (req,res) => {
    knex("leads").insert({
        lead_first_name: req.body.lead_first_name,
        lead_last_name: req.body.lead_last_name,
        method_obtained: req.body.method_obtained,
        lead_street_address: req.body.lead_street_address,
        lead_city: req.body.lead_city,
        lead_state: req.body.lead_state,
        lead_phone: req.body.lead_phone,
        lead_email: req.body.lead_email,
        notes: req.body.notes
    }).then(leads => {
        res.redirect("/leadManagement");
    });
});

app.get('/confirmLead/:id', (req, res) => {
    let id = req.params.id;
    // Query the lead by ID first
    knex('leads')
      .where('lead_id', id)
      .first()
      .then(lead => {
    
            // Render the edit form and pass both lead record and lead array
            res.render('confirmLead', { lead, security, navPage: 'leads' });
          })
          .catch(error => {
            console.error('Error fetching whole query of lead types:', error);
            res.status(500).send('Internal Server Error, Error fetching whole query of lead types');
          });
      })

      app.post("/confirmLead/:id", (req,res) => {
        const id = req.params.id
        knex('customers')
        .insert({
            cust_first_name: req.body.lead_first_name,
            cust_last_name: req.body.lead_last_name,
            notes: req.body.method_obtained,
            cust_street_address: req.body.lead_street_address,
            cust_city: req.body.lead_city,
            cust_state: req.body.lead_state,
            cust_zip: req.body.lead_zip,
            cust_phone: req.body.lead_phone,
            cust_email: req.body.lead_email,
            notes: req.body.notes
        }).then(mylead => {
            res.redirect(`/deleteLead/${id}`);
        });
    });
    app.get('/deleteLead/:id', (req, res) => {
        const id = req.params.id;
        knex('leads') // Replace 'leads' with the actual table name for your leads
          .where({ 'lead_id': id })
          .del() // Deletes the lead with the specified ID
          .then(() => {
            res.redirect('/leadManagement');
          })
          .catch((err) => {
            console.error(err);
            res.status(500).send('Error deleting the lead.');
          });
      });
// get route for the /editLead action
app.get('/editLead/:id', (req, res) => {
    let id = req.params.id;
    // Query the lead by ID first
    knex('leads')
      .where('lead_id', id)
      .first()
      .then(lead => {
    
            // Render the edit form and pass both lead record and lead array
            res.render('editLead', { lead, security, navPage: 'leads' });
          })
          .catch(error => {
            console.error('Error fetching whole query of lead types:', error);
            res.status(500).send('Internal Server Error, Error fetching whole query of lead types');
          });
      })
   

// post route to edit lead
app.post("/editLead/:id", (req,res) => {
    knex("leads").where("lead_id", req.params.id)
    .update({
        lead_first_name: req.body.lead_first_name,
        lead_last_name: req.body.lead_last_name,
        method_obtained: req.body.method_obtained,
        lead_street_address: req.body.lead_street_address,
        lead_city: req.body.lead_city,
        lead_state: req.body.lead_state,
        lead_zip: req.body.lead_zip,
        lead_phone: req.body.lead_phone,
        lead_email: req.body.lead_email,
        notes: req.body.notes
    }).then(mylead => {
        res.redirect("/leadManagement");
    });
});

// post route to delete lead
app.post("/deleteLead/:id", (req,res) => {
    knex("leads")
        .where("lead_id", req.params.id)
        .del()
        .then(lead =>{
        res.redirect("/leadManagement");
    }).catch(err => {
        console.log(err)
        res.status(500).json({err});
    });
});   


// Route for handling searching leads queries
app.get('/searchLeads', async (req, res) => {
  try {
    const q = (req.query.query || '').trim();
    if (!q) return res.redirect('/leadManagement'); // empty -> show all leads

    const page = parseInt(req.query.page) || 1;
    const limit = 15;
    const offset = (page - 1) * limit;

    hiddenSubmit = "";
    hiddenView = "hidden";

    // Count filtered results for pagination
    const totalCountRow = await knex('leads')
      .whereILike('lead_first_name', `%${q}%`)
      .orWhereILike('lead_last_name', `%${q}%`)
      .count('* as count')
      .first();

    // Select only columns we know exist in your table/UI
    const leads = await knex('leads')
      .select(
        'lead_id',
        'lead_first_name',
        'lead_last_name',
        'method_obtained',
        'lead_street_address',
        'lead_city',
        'lead_state',
        'lead_phone',
        'lead_email'
      )
      .whereILike('lead_first_name', `%${q}%`)
      .orWhereILike('lead_last_name', `%${q}%`)
      .limit(limit)
      .offset(offset);

    const totalPages = Math.ceil((Number(totalCountRow?.count) || 0) / limit);
    const noResults = leads.length === 0;

    return res.render('leadManagement', {
      leads,
      currentPage: page,
      totalPages,
      query: q,
      noResults,          // so EJS can show "No leads found."
      security,
      navPage: 'leads',
      hiddenView,
      hiddenSubmit
    });
  } catch (error) {
    console.error('Error performing search leads:', error);
    res.status(500).send('An error occurred while searching. Please try again later.');
  }
});


app.get('/searchCustomers', async (req, res) => {
  try {
    const q = (req.query.query || '').trim();
    if (!q) return res.redirect('/customerManagement');   // Clear → full list

    const page = parseInt(req.query.page) || 1;
    const limit = 15;
    const offset = (page - 1) * limit;

    hiddenSubmit = "";
    hiddenView = "hidden";

    const totalCountRow = await knex('customers')
      .whereILike('cust_first_name', `%${q}%`)
      .orWhereILike('cust_last_name', `%${q}%`)
      .count('* as count')
      .first();

    const customers = await knex('customers')
      .select('*')
      .whereILike('cust_first_name', `%${q}%`)
      .orWhereILike('cust_last_name', `%${q}%`)
      .limit(limit)
      .offset(offset);

    const totalPages = Math.ceil((Number(totalCountRow?.count) || 0) / limit);
    const noResults = customers.length === 0;

    return res.render('customerManagement', {
      customers,
      currentPage: page,
      totalPages,
      query: q,
      noResults,
      security,
      navPage: 'customers',
      hiddenView,
      hiddenSubmit,
      noResults, 
      query: ''
    });
  } catch (error) {
    console.error('Error performing search:', error);
    res.status(500).send('An error occurred while searching. Please try again later.');
  }
});




// get route for the submission page
app.get('/submission', (req, res) =>{
    res.render('submission', {
        security,
        navPage: 'home'   
    });
});


app.listen(port, () => console.log("Express is listening"));
