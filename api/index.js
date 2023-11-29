// External dependencies
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcrypt");
const dotenv = require("dotenv");
const Joi = require("joi");
const nodemailer = require('nodemailer');
const router = require('express').Router();

// Load environment variables
dotenv.config();

// Constants
const saltRounds = 12;
const port = process.env.PORT || 3000;
const expireTime = 60 * 60 * 1000;
const {
  MONGODB_DATABASE,
  MONGODB_HOST,
  MONGODB_USER,
  MONGODB_PASSWORD,
  MONGODB_SESSION_SECRET,
  NODE_SESSION_SECRET,
  MONGODB_ENDPOINT,
  MONGODB_APIKEY,
} = process.env;

// Database connection
const client = require("../databaseConnection");
const userCollection = client.db(MONGODB_DATABASE).collection("Accounts");
const sensors = client.db(MONGODB_DATABASE).collection("Availability");
const notification = client.db(MONGODB_DATABASE).collection("Notification");

// Express app configuration
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.static(__dirname + "/../public"));
app.use(express.json());

// Session store configuration
const mongoStore = MongoStore.create({
  mongoUrl: `mongodb+srv://${MONGODB_USER}:${MONGODB_PASSWORD}@${MONGODB_HOST}/sessions`,
  crypto: {
    secret: MONGODB_SESSION_SECRET,
  },
});

// Joi schemas for user input validation
const userSchema = Joi.object({
  name: Joi.string().min(3).max(20).required(),
  email: Joi.string().email().required(),
  username: Joi.string().alphanum().min(3).max(20).disallow("admin").required(),
  password: Joi.string().pattern(new RegExp("^[a-zA-Z0-9]{3,30}$")).required(),
});

const loginSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(20).disallow("admin").required(),
  password: Joi.string().pattern(new RegExp("^[a-zA-Z0-9]{3,30}$")).required(),
});

const transporter = nodemailer.createTransport({
  port: 465,               // true for 465, false for other ports
  host: "smtp.gmail.com",
     auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
       },
  secure: true,
});

app.use('/',router);
// Express app session configuration
app.use(
  session({
    secret: NODE_SESSION_SECRET,
    store: mongoStore,
    saveUninitialized: false,
    resave: true,
  })
);

// Home page
app.get("/", (req, res) => {
  const html = `<h1>Welcome to our seat occupancy app!</h1>
  To get started please <a href="/login">Login</a> or <a href="/createUser">Sign Up!</a>`;
  res.send(html);
});

// Create an account
app.get("/createUser", (req, res) => {
  const html = `
    create user
    <form action="/submitUser" method="POST">
      <input type="text" name="name" placeholder="name">
      <input type="email" name="email" placeholder="email">
      <input type="text" name="username" placeholder="username">
      <input type="password" name="password" placeholder="password">
      <button type="submit">Submit</button>
    </form>
    <button onclick="location.href='/'">Go Back</button>`;
  res.send(html);
});

// Login page
app.get("/login", (req, res) => {
  const errorMessage = req.query.error;
  const html = `
    login
    <form action="/submitLogin" method="POST">
      <input type="text" name="username" placeholder="username">
      <input type="password" name="password" placeholder="password">
      <button type="submit">Submit</button>
    </form>
    <button onclick="location.href='/'">Go Back</button>
    ${
      errorMessage
        ? `<div style="font-size: 18px; color: red;">${errorMessage}</div>`
        : ""
    }`;

  res.send(html);
});

// Post request for login
app.post("/submitLogin", async (req, res) => {
  const { username, password } = req.body;
  const user = await userCollection.findOne({ username });

  const error = loginSchema.validate(req.body).error;
  if (error) {
    console.log("Not valid input\n" + error);
    res.redirect("/login");
    return;
  }

  if (user) {
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (passwordMatch) {
      console.log("User Found");
      req.session.authenticated = true;
      req.session.username = username;
      req.session.name = user.name;
      req.session.cookie.maxAge = expireTime;
      console.log("Successfully logged in");
      res.redirect("/loggedIn");
      return;
    } else {
      console.log("Wrong Password");
      res.redirect("/login?error=wrongPassword");
      return;
    }
  } else {
    console.log("User Not Found");
    res.redirect("/login?error=userNotFound");
    return;
  }
});

// User login page
app.get("/loggedIn", async (req, res) => {
  if (!req.session.authenticated) {
    console.log("Not logged in");
    res.redirect("/login");
    return;
  }
  const username = req.session.username;
  const data = await sensors.findOne({});
  var user = await userCollection.findOne({username});
  const errorMessage = req.query.error;
  const html = `
  <head> 
    <h2>Welcome ${req.session.name}</h2> 
    <meta http-equiv="refresh" content="40">
    <script>
        function getData() {
          data = await sensors.findOne({});
        }
        setInterval('getData()', 30000);
    </script>
  </head>
  <p>Seat 1: ${data.seats[0]}</p>
  <p>Seat 2: ${data.seats[1]}</p>
  <p>Seat 3: ${data.seats[2]}</p>
  <p>Seat 4: ${data.seats[3]}</p>
  <p>Get an email notification when a seat is ready!</p>
  <form action="/email" method="POST">
  <label for="email">Enter your email:</label>
  <input type="text" name="email" id="email" placeholder="email" value="${user.email}">
  <input type="submit" value="Submit">
  </form> 
  ${
    errorMessage
      ? `<div style="font-size: 14px; color: red;">${errorMessage}</div>`
      : ""
  }
  <br>
  <button onclick="location.href='/logout'">Logout</button>`;
  res.send(html);
  for (const el of data.seats) {
    if (el == "Empty") {
      var mail = await notification.findOne();
      if (mail == null) {
        break;
      } else {
        const mailData = {
          from: process.env.EMAIL_USER,  
          to: mail.email,   
          subject: 'Seat Availability',
          text: 'A seat is available!',
        };
        transporter.sendMail(mailData, (err, info) => {
          if(err)
            console.log(err);
          else 
            console.log(info);
       });
      }
      notification.deleteOne();
      break;
    }
  }
});

// Create an new account and send user info to mongodb
app.post("/submitUser", async (req, res) => {
  const { name, email, username, password } = req.body;
  const error = userSchema.validate(req.body).error;
  if (error) {
    console.log("Error with validation" + error);
    res.redirect("/createUser");
    return;
  }
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  await userCollection.insertOne({
    name,
    email,
    username,
    password: hashedPassword,
  });
  req.session.authenticated = true;
  req.session.username = username;
  req.session.name = name;
  req.session.cookie.maxAge = expireTime;
  console.log("Successfully created user");
  res.redirect("/loggedIn");
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  console.log("Logged out");
  res.redirect("/");
});

// Error page
app.get("*", (req, res) => {
  res.status(404);
  const html = `<h1>404 - Oh no, something went wrong, that's tough!</h1>`;
  res.send(html);
});


// app.listen(port, () => {
//   console.log(`Server is running on port ${port}`);
// });

// Post request for queueing for an email
router.post('/email', (req,res) => {
  const {email} = req.body;
  notification.insertOne({"email": email});
  console.log(email);
  const mailData = {
    from: process.env.EMAIL_USER,  
    to: email,   
    subject: 'Seat Availability',
    text: 'You are in Queue for a seat. You will get another email when the seat is available.',
  };
  transporter.sendMail(mailData, (err, info) => {
    if(err)
      console.log(err);
 });
  res.redirect("/loggedIn");
});
module.exports = app;
