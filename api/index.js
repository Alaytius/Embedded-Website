// External dependencies
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcrypt");
const dotenv = require("dotenv");
const Joi = require("joi");

// Load environment variables
dotenv.config();

// Constants
const saltRounds = 12;
// const port = process.env.PORT || 3000;
const expireTime = 60 * 60 * 1000;
const {
  MONGODB_DATABASE,
  MONGODB_HOST,
  MONGODB_USER,
  MONGODB_PASSWORD,
  MONGODB_SESSION_SECRET,
  NODE_SESSION_SECRET,
} = process.env;

// Database connection
const client = require("../databaseConnection");
const userCollection = client.db(MONGODB_DATABASE).collection("Accounts");

// Express app configuration
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.static(__dirname + "/../public"));

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

// Express app session configuration
app.use(
  session({
    secret: NODE_SESSION_SECRET,
    store: mongoStore,
    saveUninitialized: false,
    resave: true,
  })
);

app.get("/", (req, res) => {
  const html = `Welcome to the homepage! <a href="/login">Login</a> or <a href="/createUser">Sign Up!</a>`;
  res.send(html);
});

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

app.get("/loggedIn", (req, res) => {
  if (!req.session.authenticated) {
    console.log("Not logged in");
    res.redirect("/login");
    return;
  }
  const randomNumber = Math.floor(Math.random() * 5) + 1;
  const imageName = `picture${randomNumber}.png`;

  const html = `<h1>Yay, you're logged In</h1> 
  <h2>Welcome ${req.session.name}</h2> 
  <img src="${imageName}" alt="Random image" style="width: 200px; height: 200px;"> 
  <br>
  <button onclick="location.href='/logout'">Logout</button>`;
  res.send(html);
});

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

app.get("/logout", (req, res) => {
  req.session.destroy();
  console.log("Logged out");
  res.redirect("/");
});

app.get("*", (req, res) => {
  res.status(404);
  const html = `<h1>404 - Oh no, something went wrong, that's tough!</h1>`;
  res.send(html);
});

// app.listen(port, () => {
//   console.log(`Server is running on port ${port}`);
// });
module.exports = app;
