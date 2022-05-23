const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 5000;
require('dotenv').config();
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.9vbqe.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyJwt = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).send({ message: 'unauthorized' });
  }
  const token = header.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'forbidden' });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  client.connect();
  const toolCollections = client.db('toolsDb').collection('toolCollection');
  const userCollections = client.db('toolsDb').collection('userCollection');
  const orderCollections = client.db('toolsDb').collection('orderCollection');

  try {
    app.get('/tools', async (req, res) => {
      const query = {};
      const result = await toolCollections.find(query).toArray();
      res.send(result);
    });
    app.get('/tools/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await toolCollections.findOne(query);
      res.send(result);
    });

    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const updateDoc = {
        $set: user,
      };
      const option = { upsert: true };

      const result = await userCollections.updateOne(filter, updateDoc, option);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: '1h',
      });

      res.send({ result, accessToken: token });
    });

    app.post('/order', async (req, res) => {
      const order = req.body;
      const result = await orderCollections.insertOne(order);
      res.send({ result, success: true });
    });

    app.get('/order/:email',verifyJwt, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await orderCollections.find(query).toArray();
      res.send(result);
    });

    app.get('/order/payment/:id',verifyJwt, async(req,res) =>{
      const id = req.params.id;
      const query = {_id:ObjectId(id)}
      const result = await orderCollections.findOne(query);
      res.send(result);
    })
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log('App is listening at ', port);
});
