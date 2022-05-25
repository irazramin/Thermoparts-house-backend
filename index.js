const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 5000;
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
  console.log(header)
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
  const reviewCollections = client.db('toolsDb').collection('reviewCollection');
  const userProfileCollections = client
    .db('toolsDb')
    .collection('userProfileCollection');

  try {
    const adminVerification = async (req, res, next) => {
      const adminRequestEmail = req.decoded.email;
      const requesterAccount = await userCollections.findOne({
        email: adminRequestEmail,
      });
      if (requesterAccount.role === 'admin') {
        next();
      } else {
        res.status(403).send({ message: 'forbidden' });
      }
    };

    app.post('/create-payment-intent', async (req, res) => {
      const product = req.body;
      const price = product.totalAmount;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card'],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    app.get('/tools', async (req, res) => {
      const query = {};
      const result = await toolCollections.find(query).toArray();
      res.send(result);
    });

    app.post('/tools', async (req, res) => {
      const product = req.body;
      const result = await toolCollections.insertOne(product);
      res.send(result);
    });

    app.get('/tools/:id', verifyJwt, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await toolCollections.findOne(query);
      res.send(result);
    });
    app.patch('/tools/:id', async (req, res) => {
      const id = req.params.id;
      const available = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          available: available.available,
        },
      };
      const updateOrder = await toolCollections.updateOne(filter, updateDoc);
      res.send(updateOrder);
    });

    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const option = { upsert: true };

      const updateDoc = {
        $set: user,
      };
      const result = await userCollections.updateOne(filter, updateDoc, option);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, {
        expiresIn: '2d',
      });

      res.send({ result, accessToken: token });
    });

    app.post('/order', async (req, res) => {
      const order = req.body;
      const id = order._id;
      const quantity = order.quantity;
      const query = { id };

      const tools = await toolCollections.findOne(query);
      const result = await orderCollections.insertOne(order);

      tools.available = tools.available - quantity;
      const available = tools.available;
      res.send({ result, success: true, available: available });
    });

    app.get('/order/:email', verifyJwt, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await orderCollections.find(query).toArray();
      res.send(result);
    });

    app.get('/order/payment/:id', verifyJwt, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await orderCollections.findOne(query);
      res.send(result);
    });

    app.patch('/order/payment/:id', async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          paid: payment.paid,
          transactionId: payment.transactionId,
        },
      };
      const updateAvailableQuantity = await orderCollections.updateOne(
        filter,
        updateDoc
      );
      res.send(updateAvailableQuantity);
    });

    app.delete(
      '/admin/order/allorder/:id',
      verifyJwt,
      adminVerification,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: ObjectId(id) };
        const result = await orderCollections.deleteOne(filter);
        res.send(result);
      }
    );

    app.get(
      '/admin/tools/allproducts',
      verifyJwt,
      adminVerification,
      async (req, res) => {
        const query = {};
        const result = await toolCollections.find(query).toArray();
        res.send(result);
      }
    );

    app.get(
      '/admin/order/allorder',
      verifyJwt,
      adminVerification,
      async (req, res) => {
        const query = {};
        const result = await orderCollections.find(query).toArray();
        res.send(result);
      }
    );

    
    app.put(
      '/admin/users/makeadmin/:id',
      verifyJwt,
      adminVerification,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: ObjectId(id) };
        const option = { upsert: true };
        const updateDoc = {
          $set: {
            role: 'admin',
          },
        };
        const result = await userCollections.updateOne(
          filter,
          updateDoc,
          option
        );
        res.send(result);
      }
    );

      app.get(
        '/admin/:email',
        verifyJwt,
        adminVerification,
        async (req, res) => {
          const email = req.params.email;
          const query = { email };
          const result = await userCollections.findOne(query);
          const isAdmin = result?.role === 'admin';
          res.send({ admin: isAdmin });
        }
      );

      app.get(
        '/admin/users/details',
        verifyJwt,
        adminVerification,
        async (req, res) => {
          const query = {};
          const result = await userCollections.find(query).toArray();
          res.send(result);
        }
      );

      app.delete(
        '/admin/product/allproduct/:id',
        verifyJwt,
        adminVerification,
        async (req, res) => {
          const id = req.params.id;
          const filter = { _id: ObjectId(id) };
          const result = await toolCollections.deleteOne(filter);
          res.send(result);
        }
      );

    app.put(
      '/admin/order/allorder/shipment/:id',
      verifyJwt,
      adminVerification,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: ObjectId(id) };
        const updateDoc = {
          $set: {
            shipment: true,
          },
        };
        const option = { upsert: true };
        const result = await orderCollections.updateOne(
          filter,
          updateDoc,
          option
        );
        res.send(result);
      }
    );

    app.delete('/order/payment/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await orderCollections.deleteOne(filter);
      res.send(result);
    });

    app.post('/review', async (req, res) => {
      const review = req.body;
      const result = await reviewCollections.insertOne(review);
      res.send(result);
    });

    app.get('/review', async (req, res) => {
      const query = {};
      const result = await reviewCollections.find(query).toArray();
      res.send(result);
    });

    app.put('/userprofile/:email', async (req, res) => {
      const email = req.params.email;
      const profile = req.body;
      const option = { upsert: true };
      const filter = { email };
      const doc = {
        $set: {
          firstName: profile.fName,
          lastName: profile.lName,
          email: profile.email,
          location: profile.location,
          phone: profile.phone,
          education: profile.education,
          linkedin: profile.linkedin,
          github: profile.github,
        },
      };
      const result = await userProfileCollections.updateOne(
        filter,
        doc,
        option
      );
      res.send(result);
    });

    app.get('/userprofile/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await userProfileCollections.findOne(query);
      res.send(result);
    });

    app.get('/userprofile/:email', async (req, res) => {
      const query = {};
      const result = await reviewCollections.find(query).toArray();
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log('App is listening at ', port);
});
