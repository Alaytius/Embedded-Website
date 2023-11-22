require("dotenv").config();

const MONGODB_HOST = process.env.MONGODB_HOST;
const MONGODB_USER = process.env.MONGODB_USER;
const MONGODB_PASSWORD = process.env.MONGODB_PASSWORD;

const MongoClient = require("mongodb").MongoClient;
const clusterConnect = `mongodb+srv://${MONGODB_USER}:${MONGODB_PASSWORD}@${MONGODB_HOST}/?retryWrites=true`;
const client = new MongoClient(clusterConnect, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

module.exports = client;
