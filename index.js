let express = require("express");

let app = express();

let path = require("path");

const port = process.env.PORT || 5002;

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
        password: process.env.RDS_PASSWORD || "mom#8181",
        database: process.env.RDS_DB_NAME || "glass_guys",
        port: process.env.RDS_PORT || 5432,
        ssl: process.env.DB_SSL ? {rejectUnauthorized: false} : false
    }
});

// get rout for home page
app.get("/", (req, res) => {
    res.render("index", {security}); 
});

// get route for calculator page
app.get('/calculator', (req, res) => {
    res.render('calculator', {security});
});

// get route for about us
app.get('/aboutUs', (req, res) => {
    res.render('aboutUs', {security});
});

// get route for services
app.get('/services', (req, res) => {
    res.render('services', {security});
});

// get route for leads
app.get('/leads', (req, res) => {
    res.render('leads', {security});
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
    res.render('login', {security}); // Ensure login.ejs is in the views folder
});
app.post('/login', (req, res) => {
    const emp_username = req.body.emp_username;
    const emp_password = req.body.emp_password;
    try {
        // Query the user table to find the record
        const user = knex('login_info')
            .select('*')
            .where({ emp_username, emp_password }) // Replace with hashed password comparison in production
            .first(); // Returns the first matching record
        if (user) {
            security = true;
        } else {
            security = false;
        }
    } catch (error) {
        res.status(500).send('Database query failed: ' + error.message);
    }
    res.redirect("/customerManagement")
  });
// get method for logging out
  app.get('/logout', (req, res) => {
    security = false;
    res.render('index', { security: false, page: 'home' });
  });

// get route to view all customers
app.get('/customerManagement', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; // Default to page 1
        const limit = 15; // Show 15 customers per page
        const offset = (page - 1) * limit; // Calculate offset for the database query

        // Fetch the total number of customers for pagination
        const totalCustomers = await knex("customer").count('* as count').first();
        const totalPages = Math.ceil(totalCustomers.count / limit);

        hiddenSubmit = "hidden";
        hiddenView = "";

        // Fetch the customers for the current page
        const customers = await knex("customer")
        .leftJoin('customer_status', 'customer_status.cust_status_id', '=', 'customer.cust_status_id')
            .select(
                "customer.cust_id",
                "customer.cust_first_name",
                "customer.cust_last_name",
                "customer.quote_price",
                "customer.cust_street_address",
                "customer.cust_city",
                "customer.cust_state",
                "customer.cust_zip",
                "customer.cust_phone",
                "customer.cust_email",
                'customer_status.status_description'
            )
            .limit(limit)
            .offset(offset);

        // Render the page
        res.render('customerManagement', { customers, currentPage: page, totalPages, page: 'Customer', security, hiddenView, hiddenSubmit });
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).send("Error fetching data.");
    }
});
  

// get route for the /editCustomer action
app.get('/editCustomer/:id', (req, res) => {
    let id = req.params.id;
    // Query the Customer by ID first
    knex('customer')
      .where('cust_id', id)
      .first()
      .then(customerRec => {
        if (!customerRec) {
          return res.status(404).send('customer not found');
        }
        // Query all Customers
        knex('customer')
          .select("*")
          .then(customer => {
            // Render the edit form and pass both customer record and customer array
            res.render('editCustomer', { customerRec, customer });
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
    knex("customer").where("cust_id", parseInt(req.params.id)).update({
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
app.get("/addCustomer/", (req,res) =>{
    res.render("addCustomer");
});

// post route to add customer
app.post("/addCustomer", (req,res) => {
    knex("customer").insert({
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
app.get("/returnHome/", (req,res) =>{
    res.render("index");
});



// post route to delete customer
app.post("/deleteCustomer/:id", (req,res) => {
    knex("customer").where("cust_id", req.params.id).del().then(customer =>{
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
        res.render('leadManagement', { leads, currentPage: page, totalPages, page: 'Leads', security, hiddenSubmit, hiddenView });
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).send("Error fetching data.");
    }
});

// get route to add lead
app.get("/addLead/", (req,res) =>{
    res.render("addLead");
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
            res.render('confirmLead', {  lead });
          })
          .catch(error => {
            console.error('Error fetching whole query of lead types:', error);
            res.status(500).send('Internal Server Error, Error fetching whole query of lead types');
          });
      })

      app.post("/confirmLead/:id", (req,res) => {
        const id = req.params.id
        knex('customer')
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
            res.render('editLead', {  lead });
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



// Route for handling searching customers queries
app.get('/searchCustomers', async (req, res) => {
    const query = req.query.query.toUpperCase(); // Get the search query from the URL
    const page = parseInt(req.query.page) || 1; // Default to page 1
    const limit = 15; // Show 15 volunteers per page
    const offset = (page - 1) * limit; // Calculate offset for the database query
    // Fetch the total number of volunteer for pagination
    const totalCustomers = await knex("customer").count('* as count').first();
    const totalPages = Math.ceil(totalCustomers.count / limit);
    hiddenSubmit = "";
    hiddenView = "hidden";

    if (!query) {
        return res.render('search', { customer: [] }); // Render with no results if no query
    }

    try {
        const customers = await knex('customer')
            .select('*')
            .whereRaw('UPPER("cust_first_name") LIKE ?', [`%${query}%`]) // Match uppercase query for first name
            .orWhereRaw('UPPER("cust_last_name") LIKE ?', [`%${query}%`]) // Match uppercase query for last name
            .limit(limit)
            .offset(offset);
            console.log({
                customers
            });
            
        res.render('customerManagement', { customers, currentPage: page, totalPages, page: 'Customer', security, hiddenView, hiddenSubmit });
    } catch (error) {
        console.error('Error performing search:', error);
        res.status(500).send('An error occurred while searching. Please try again later.');
    }
});

// Route for handling searching leads queries
app.get('/searchLeads', async (req, res) => {
    const query = req.query.query.toUpperCase(); // Get the search query from the URL
    const page = parseInt(req.query.page) || 1; // Default to page 1
    const limit = 15; // Show 15 volunteers per page
    const offset = (page - 1) * limit; // Calculate offset for the database query
    // Fetch the total number of leads for pagination
    const totalLeads = await knex("leads").count('* as count').first();
    const totalPages = Math.ceil(totalLeads.count / limit);
    hiddenSubmit = "";
    hiddenView = "hidden";

    if (!query) {
        return res.render('search', { leads: [] }); // Render with no results if no query
    }

    try {
        const leads = await knex('leads')
            .select('')
            .whereRaw('UPPER("lead_first_name") LIKE ?', [`%${query}%`]) // Match uppercase query for first name
            .orWhereRaw('UPPER("lead_last_name") LIKE ?', [`%${query}%`]) // Match uppercase query for last name
            .limit(limit)
            .offset(offset);
            
        res.render('leadManagement', { leads, currentPage: page, totalPages, page: 'Leads', security, hiddenView, hiddenSubmit });
    } catch (error) {
        console.error('Error performing search:', error);
        res.status(500).send('An error occurred while searching. Please try again later.');
    }
});

// get route for the submission page
app.get('/submission', (req, res) =>{
    res.render('submission', {security});
});

app.listen(port, () => console.log("Express is listening"));
