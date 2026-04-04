const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const app = express();
const port = 5000;

// MongoDB setup

mongoose.connect('mongodb+srv://sendadnane_db_user:ksmc9T8sNuCMPQ6R@smtp-2.h6jjp85.mongodb.net/?appName=SMTP-2');
const db = mongoose.connection;

db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

// Email Account Schema
const emailAccountSchema = new mongoose.Schema({
    user: String,  // Email address
    pass: String,  // App password or SMTP password
    host: String,  // SMTP server (e.g., smtp.gmail.com, smtp.mail.yahoo.com)
    port: Number,  // SMTP port (e.g., 465, 587)
    isSSL: Boolean // Whether to use SSL (true/false)
});

const EmailAccount = mongoose.model('EmailAccount', emailAccountSchema);

// Middleware
app.use(cors({
    origin: 'http://localhost:3000', // Allow requests from your frontend
    methods: ["GET", "POST", "DELETE", "OPTIONS"], 
    credentials: true, 
    
  }));
app.use(bodyParser.json());

// Email operations tracking
let emailsSent = 0;
let emailsFailed = 0;
let emailOpens = {};
let emailCountPerAccount = {}; // Track emails sent per account
let clients = []; // Array to track clients for EventSource

app.post('/send-emails', async (req, res) => {
    const { recipients, subject, body, batchSize, fromEmail } = req.body; // 'batchSize' from frontend

    if (!recipients || recipients.length === 0 || !subject || !body || !batchSize || !fromEmail) {
        return res.status(400).send('Invalid request.');
    }

    emailsSent = 0; // Reset the counter
    emailsFailed = 0; // Reset the counter
    failedEmails = []; // Reset the failed emails list
    sentEmails = []; // New list for successfully sent emails
    openedEmails = []; // New list for opened emails (will be tracked separately)

    const MAX_EMAILS_PER_ACCOUNT = parseInt(batchSize, 10); // Limit emails per account from the frontend

    const emailAccounts = await EmailAccount.find(); // Fetch email accounts from MongoDB
    if (emailAccounts.length === 0) {
        return res.status(400).send('No email accounts available.');
    }

    emailCountPerAccount = {}; // Reset email count tracking
    emailAccounts.forEach(account => {
        emailCountPerAccount[account.user] = 0; // Initialize email count for each account
    });

    let currentAccountIndex = 0; // Start with the first account

    function sendEmailsInBatch() {
        const sendNextBatch = () => {
            if (recipients.length === 0) {
                clearInterval(batchInterval);
    
                // Send the list of failed emails back to the frontend
                return res.json({
                    message: 'All emails sent.',
                    emailsSent,
                    emailsFailed,
                    sentEmails, // Send sent emails list
                    failedEmails, // Send failed emails list
                    openedEmails, // Send opened emails list (currently empty but tracked elsewhere)
                });
            }
    
            // Rotate to the next account if the current one reaches the limit
            while (currentAccountIndex < emailAccounts.length && emailCountPerAccount[emailAccounts[currentAccountIndex].user] >= MAX_EMAILS_PER_ACCOUNT) {
                currentAccountIndex++;
            }
    
            // If all accounts are exhausted, stop the process
            if (currentAccountIndex >= emailAccounts.length) {
                clearInterval(batchInterval);
                return res.status(429).send('All email accounts have reached their limit.');
            }
    
            // Set up the transporter for the current account
            const currentAccount = emailAccounts[currentAccountIndex]; // Capture the current account in a constant
            const transporter = nodemailer.createTransport({
                host: currentAccount.host, // SMTP server (e.g., smtp.gmail.com)
                port: currentAccount.port, // SMTP port (e.g., 465 or 587)
                secure: currentAccount.isSSL, // True for 465 (SSL), false for 587 (TLS)
                auth: {
                    user: currentAccount.user, // Email address
                    pass: currentAccount.pass  // App password or SMTP password
                }
            });
    
            // Send a batch of up to 5 emails from the current account
            for (let i = 0; i < 5 && recipients.length > 0 && emailCountPerAccount[currentAccount.user] < MAX_EMAILS_PER_ACCOUNT; i++) {
                const currentRecipient = recipients.shift(); // Get the next recipient
                if (!currentRecipient) continue;
    
                const mailOptions = {
                    from:` ${fromEmail} <${currentAccount.user}>`,
                    to: currentRecipient,
                    subject: subject,
                    html: body + `<img src="http://localhost:5000/track-open?email=${currentRecipient}" style="display:none" />`
                };
    
                // Send the email
                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        emailsFailed++;
                        failedEmails.push({ recipient: currentRecipient, account: currentAccount.user }); // Use the captured account
                        clients.forEach(client => client.write(`data: ${JSON.stringify({ emailsSent, emailsFailed, recipient: currentRecipient, account: currentAccount.user, status: 'failed' })}\n\n`));
                    } else {
                        emailsSent++;
                        sentEmails.push(currentRecipient);
                        emailCountPerAccount[currentAccount.user]++; // Increment count for the captured account
                        clients.forEach(client => client.write(`data: ${JSON.stringify({ emailsSent, emailsFailed, recipient: currentRecipient, status: 'success' })}\n\n`));
                    }
    
                    // Check if the current account has reached its limit
                    if (emailCountPerAccount[currentAccount.user] >= MAX_EMAILS_PER_ACCOUNT) {
                        console.log(`Account ${currentAccount.user} reached its limit of ${MAX_EMAILS_PER_ACCOUNT} emails.`);
                    }
                });
            }
    
            // Move to the next account in the round-robin rotation
            currentAccountIndex = (currentAccountIndex + 1) % emailAccounts.length;
    
            // Stop if all accounts have reached their limit
            if (Object.values(emailCountPerAccount).every(count => count >= MAX_EMAILS_PER_ACCOUNT)) {
                clearInterval(batchInterval);
                return res.status(429).send('All email accounts have reached their limit.');
            }
        };
    
        // Send batches of emails every 10 seconds
        const batchInterval = setInterval(() => {
            sendNextBatch();
        }, 10000);
    }

    sendEmailsInBatch(); // Start the email sending process
});


app.get('/track-open', (req, res) => {
    const { email } = req.query;
    console.log(`Tracking email open for: ${email}`);
    if (email) {
        if (!emailOpens[email]) {
            emailOpens[email] = 0;
        }
        emailOpens[email]++;
        console.log(`Email opens for ${email}: ${emailOpens[email]}`);
    }

    res.sendFile(path.join(__dirname, 'pixel.png'));
});

app.get('/email-progress', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    clients.push(res);

    req.on('close', () => {
        clients = clients.filter(client => client !== res);
    });

    res.write(`data: ${JSON.stringify({ emailsSent, emailsFailed, uniqueOpens: Object.keys(emailOpens).length })}\n\n`);
});

app.get('/email-accounts', async (req, res) => {
    const emailAccounts = await EmailAccount.find();
    res.json(emailAccounts);
});

app.post('/add-email-account', async (req, res) => {
    let emailAccounts = req.body;

    if (!Array.isArray(emailAccounts)) {
        emailAccounts = [emailAccounts];
    }

    try {
        const accountsToInsert = emailAccounts.map(account => ({
            user: account.user,
            pass: account.pass,
            host: account.host,
            port: Number(account.port),
            isSSL: Boolean(account.isSSL)
        }));

        await EmailAccount.insertMany(accountsToInsert);
        res.status(201).send('Email accounts added successfully.');
    } catch (error) {
        res.status(500).send('Error saving email accounts.');
    }
});


app.delete('/delete-email-account', async (req, res) => {
    const { user } = req.body;

    if (!user) {
        return res.status(400).send('Email user is required.');
    }

    const result = await EmailAccount.deleteOne({ user });

    if (result.deletedCount === 0) {
        return res.status(404).send('Email account not found.');
    }

    res.status(200).send('Email account deleted successfully.');
});

app.post('/test-smtp', async (req, res) => {
    const { user, pass, host, port, isSSL, testEmail } = req.body;

    if (!user || !pass || !host || !port || !testEmail) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    try {
        const transporter = nodemailer.createTransport({
            host: host,
            port: port,
            secure: isSSL, // True for SSL (465), false for TLS (587)
            auth: {
                user: user,
                pass: pass
            }
        });

        const mailOptions = {
            from: `${user}`,
            to: testEmail,
            subject: 'SMTP Test Email',
            text: 'This is a test email to verify SMTP configuration.'
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'SMTP connection is working. Test email sent successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: `SMTP test failed: ${error.message}` });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});







