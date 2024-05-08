const express = require("express");
const app = express();
const http = require('http');
const bodyParser = require('body-parser');
const axios = require('axios');
const { MongoClient, ServerApiVersion } = require('mongodb');
const config = require('./config.json');
const cron = require('node-cron'); // Import the node-cron package

if (!config) {
    console.error('Config file not found.');
    process.exit(1);
}
if (!config.BOT_TOKEN || !config.CHAT_ID || !config.server_port) {
    console.error('Config file missing items. Please regenerate');
    process.exit(1);
}

const uri = 'mongodb+srv://nekozuX:farih2009@nekozu.wlvpzbo.mongodb.net/?retryWrites=true&w=majority&appName=nekozu';
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
let usersCollection;

async function deleteExpiredMessages() {
    const currentDate = new Date();
    const expiredDocuments = await usersCollection.find({ "expiry_date": { $lt: currentDate } }).toArray();

    for (const doc of expiredDocuments) {
        await usersCollection.deleteOne({ "_id": doc._id });
        console.log(`Deleted expired message for user ${doc.user_id}`);
    }
}
async function run() {
    try {
        // Connect the client to the server
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        const db = client.db('nekozu');
        usersCollection = db.collection('users');

        // Schedule the deletion of expired messages every day at 00:00
        cron.schedule('0 0 * * *', deleteExpiredMessages);
    } catch (err) {
        console.error(err);
    }
}

run().catch(console.dir);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post('/post', async function (req, res) {
    const data = req.body.data;
    if (!data) return;

    try {
        const obj = JSON.parse(data);
        
        // Check if the direct_link_code matches one of the allowed values
        // Proceed with processing the order
                // Check if the direct_link_code matches one of the allowed values
        const allowedDirectLinkCodes = ["7108bcad50", "2993b6ab0b", "a1b2c3d4e5", "1a2b3c4d5e"];
        const isAllowedDirectLink = allowedDirectLinkCodes.includes(obj.shop_items[0].direct_link_code);
        if (!isAllowedDirectLink) {
            console.log("Direct link code not allowed for this user.");
            return res.status(403).json({ success: false, error: 'Direct link code not allowed for this user.' });
        }
        const message = `New Ko-Fi Supporter!\nFrom: ${obj.from_name}\nAmount: ${obj.amount}\nMessage: ${obj.message}`;
        await axios.get(`https://api.telegram.org/bot${config.BOT_TOKEN}/sendMessage?chat_id=${config.CHAT_ID}&text=${message}`);

        if (!usersCollection) {
            console.error('Database connection not established');
            return res.status(500).json({ success: false, error: 'Database connection not established' });
        }

        // Calculate expiry date based on direct_link_code
        let expiryDate = new Date();
        expiryDate.setUTCHours(0, 0, 0, 0);
        if (obj.shop_items[0].direct_link_code === "7108bcad50") {
            expiryDate.setFullYear(expiryDate.getFullYear() + 1); // 1 year from now
            await axios.get(`https://api.telegram.org/bot${config.BOT_TOKEN}/sendMessage?chat_id=${config.CHAT_ID}&text=Thank you for your donation! Your message will be saved for 1 year.`);
        } else if (obj.shop_items[0].direct_link_code === "2993b6ab0b") {
            expiryDate.setMonth(expiryDate.getMonth() + 1); // 1 month from now
            await axios.get(`https://api.telegram.org/bot${config.BOT_TOKEN}/sendMessage?chat_id=${config.CHAT_ID}&text=Thank you for your donation! Your message will be saved for 1 month.`);
        } else {
            expiryDate.setMonth(expiryDate.getMonth() + 5); // 5 months from now (default)
            await axios.get(`https://api.telegram.org/bot${config.BOT_TOKEN}/sendMessage?chat_id=${config.CHAT_ID}&text=Thank you for your donation! Your message will be saved for 5 months.`);
        }

        // Create or update user document
        const result = await usersCollection.updateOne(
            { "user_id": obj.message },
            {
                $set: {
                    "user_id": obj.message,
                    "message": obj.message,
                    "donation_amount": obj.amount,
                    "expiry_date": expiryDate
                }
            },
            { upsert: true }
        );

        if (result.upsertedId) {
            console.log(`User ${obj.message} added with message: ${obj.message}`);
        } else {
            console.log(`User ${obj.message} updated with message: ${obj.message}`);
        }

    } catch (err) {
        console.error(err);
        return res.json({ success: false, error: err });
    }
    return res.json({ success: true });
});

app.use('/', async function (req, res) { //Handling requests to the main endpoint
    res.json({ message: "Ko-Fi Server is online!" });
    return;
});

const httpServer = http.createServer(app); //Setting up the server
httpServer.listen(config.server_port, function () {
    console.log(`Ko-Fi Server online on port ${config.server_port}`);
});
