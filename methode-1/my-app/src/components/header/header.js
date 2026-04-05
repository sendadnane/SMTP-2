import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import axios from 'axios';
import Swal from 'sweetalert2';
import { Editor } from '@tinymce/tinymce-react'; // Import TinyMCE Editor
import './header.css';

const Header = () => {
    // State variables
    const [emails, setEmails] = useState([]);
    const [emailAccounts, setEmailAccounts] = useState([]);
    const [emailsSent, setEmailsSent] = useState(0);
    const [emailsFailed, setEmailsFailed] = useState(0);
    const [uniqueOpens, setUniqueOpens] = useState(0);
    const [sending, setSending] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [authenticated, setAuthenticated] = useState(false);
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    const [activeTab, setActiveTab] = useState('send');
    const [newEmailUser, setNewEmailUser] = useState('');
    const [newEmailPass, setNewEmailPass] = useState('');
    const [newEmailHost, setNewEmailHost] = useState(''); // Stores SMTP Host
    const [newEmailPort, setNewEmailPort] = useState(''); // Stores SMTP Port
    const [newEmailSSL, setNewEmailSSL] = useState(false); // Stores SSL checkbox state (true/false)
    const [batchSize, setBatchSize] = useState(100);
    const [failedEmailsList, setFailedEmailsList] = useState([]); // New state
    const [sentEmailsList, setSentEmailsList] = useState([]); // Sent emails list
    const [openedEmailsList, setOpenedEmailsList] = useState([]); // Opened emails list
    const [fromEmail, setFromEmail] = useState('');
    const [uploadedData, setUploadedData] = useState([]);
    


    useEffect(() => { 
        Swal.fire({
            title: 'Login',
            html: `<input type="text" id="username" class="swal2-input" placeholder="Username">
                   <input type="password" id="password" class="swal2-input" placeholder="Password">`,
            confirmButtonText: 'Login',
            preConfirm: () => {
                const username = Swal.getPopup().querySelector('#username').value;
                const password = Swal.getPopup().querySelector('#password').value;
                if (!username || !password) {
                    Swal.showValidationMessage(`Please enter username and password`);
                }
                return { username, password };
            }
        }).then((result) => {
            if (result.isConfirmed && result.value) {
                const { username, password } = result.value;
                authenticateUser(username, password);
            }
        });
    }, []);

    useEffect(() => {
        if (authenticated) {
            fetchEmailAccounts();
        }
    }, [authenticated]);

    const authenticateUser = (username, password) => {
        if (username === 'adnane' && password === '12345') {
            setAuthenticated(true);
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Authentication Failed',
                text: 'Incorrect username or password'
            }).then(() => {
                window.location.href = '/not-found';
            });
        }
    };

    const fetchEmailAccounts = async () => {
        try {
            const response = await axios.get('https://smtp-2-hiez.onrender.com/email-accounts');
            setEmailAccounts(response.data);
        } catch (error) {
            console.error('Error fetching email accounts:', error);
        }
    };

    const handleDeleteEmailAccount = async (emailUser) => {
        try {
            const response = await axios.delete('https://smtp-2-hiez.onrender.com/delete-email-account', { data: { user: emailUser } });

            if (response.status === 200) {
                setEmailAccounts(emailAccounts.filter(account => account.user !== emailUser));
                Swal.fire('Deleted!', 'The email account has been removed.', 'success');
            } else {
                Swal.fire('Error', 'Failed to delete email account', 'error');
            }
        } catch (error) {
            Swal.fire('Error', 'An error occurred while deleting the email account', 'error');
        }
    };
  const uploadedSMTP = (event) => {
        const file = event.target.files[0];
        if (!file) return;
    
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet);
    
            // Normalize Excel fields to match expected schema
            const normalizedAccounts = jsonData.map(account => ({
                user: account.Email || account.user || '',
                pass: account.Password || account.pass || '',
                host: account.SMTP_Host || account.host || '',
                port: Number(account.SMTP_Port || account.port || 0),
                isSSL: account.SSL === 'Yes' || account.isSSL === true
            }));
    
            setUploadedData(normalizedAccounts);
        };
        reader.readAsArrayBuffer(file);
    };
    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        const reader = new FileReader();

        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            const emailList = sheetData.map(row => row[0]).filter(email => /\S+@\S+\.\S+/.test(email));
            setEmails(emailList);
        };

        reader.readAsArrayBuffer(file);
    };

    const handleDelete = (emailToDelete) => {
        setEmails(emails.filter(email => email !== emailToDelete));
    };

    const handleSendEmails = () => {
        setSending(true);
        setCompleted(false);
        setEmailsSent(0);
        setEmailsFailed(0);

        if (!emailSubject || !emailBody  || !fromEmail) {
            Swal.fire('Error', 'Please provide both subject and body text', 'error');
            setSending(false);
            return;
        }

        axios.post('https://smtp-2-hiez.onrender.com/send-emails', { recipients: emails, subject: emailSubject, body: emailBody, batchSize: batchSize, fromEmail: fromEmail })
            .then(response => {
                console.log('Emails sent successfully:', response.data);
                setCompleted(true);
                setSending(false);
                
                setFailedEmailsList(response.data.failedEmails?.map(failure => ({ email: failure.recipient, account: failure.account })) || []); 
                setSentEmailsList(response.data.sentEmails || []); 
            })
            .catch(error => {
                console.error('Error sending emails:', error);
                setSending(false);
            });

            const eventSource = new EventSource('https://smtp-2-hiez.onrender.com/email-progress');
            eventSource.onmessage = (event) => {
              const data = JSON.parse(event.data);

              setEmailsSent(data.emailsSent);
              setEmailsFailed(data.emailsFailed);
              setUniqueOpens(data.uniqueOpens || 0);
              if (data.openedEmails) {
                setOpenedEmailsList(data.openedEmails);  // Track opened emails
            }
            
              if (data.emailsSent === emails.length) {
                setCompleted(true);
                setSending(false);
                eventSource.close(); // Close the connection once all emails are sent
              }
            };
            
            eventSource.onerror = () => {
              eventSource.close();
            };
    };

 const handleAddEmailAccount = async () => {
        const accountsToAdd = [];
    
        // Add manual entry if present
        if (newEmailUser && newEmailPass && newEmailHost && newEmailPort) {
            accountsToAdd.push({
                user: newEmailUser,
                pass: newEmailPass,
                host: newEmailHost,
                port: Number(newEmailPort),
                isSSL: newEmailSSL
            });
        }
    
        // Add uploaded accounts if any
        if (uploadedData.length > 0) {
            accountsToAdd.push(...uploadedData);
        }
    
        if (accountsToAdd.length === 0) {
            Swal.fire('Error', 'No email account data provided', 'error');
            return;
        }
    
        try {
            const response = await axios.post('https://smtp-2-hiez.onrender.com/add-email-account', accountsToAdd);
            if (response.status === 201) {
                Swal.fire('Success', 'Email accounts added successfully', 'success');
                setEmailAccounts([...emailAccounts, ...accountsToAdd]);
                setNewEmailUser('');
                setNewEmailPass('');
                setNewEmailHost('');
                setNewEmailPort('');
                setNewEmailSSL(false);
                setUploadedData([]);
            } else {
                Swal.fire('Error', 'Failed to add email accounts', 'error');
            }
        } catch (error) {
            Swal.fire('Error', 'An error occurred while adding email accounts', 'error');
        }
    };
    const handleTestSMTP = async (account) => {
        const testEmail = prompt("Enter a test email address to receive a verification email:");
    
        if (!testEmail) {
            Swal.fire('Error', 'Test email is required.', 'error');
            return;
        }
    
        try {
            const response = await axios.post('https://smtp-2-hiez.onrender.com/test-smtp', {
                user: account.user,
                pass: account.pass,
                host: account.host,
                port: account.port,
                isSSL: account.isSSL,
                testEmail: testEmail
            });
    
            if (response.data.success) {
                Swal.fire('Success', response.data.message, 'success');
            } else {
                Swal.fire('Error', response.data.message, 'error');
            }
        } catch (error) {
            console.error("SMTP Test Error:", error.response?.data || error.message);
            Swal.fire('Error', 'SMTP test failed. Please check console for details.', 'error');
            console.error("SMTP Test Error:", error);
        }
    };
    
 

    return (
        <>
            {authenticated && (
                <div className='container'>
                    <h1>Welcome to Dashboard</h1>

                    {/* Tabs Navigation */}
                    <div className="tabs">
                        <button
                            className={`tab-button ${activeTab === 'send' ? 'active' : ''}`}
                            onClick={() => setActiveTab('send')}
                        >
                            Send Emails
                        </button>
                        <button
                            className={`tab-button ${activeTab === 'upload' ? 'active' : ''}`}
                            onClick={() => setActiveTab('upload')}
                        >
                            Upload File
                        </button>
                        <button
                            className={`tab-button ${activeTab === 'template' ? 'active' : ''}`}
                            onClick={() => setActiveTab('template')}
                        >
                            Email Template
                        </button>
                        <button
                            className={`tab-button ${activeTab === 'addMails' ? 'active' : ''}`}
                            onClick={() => setActiveTab('addMails')}
                        >
                            Add Mails
                        </button>
                    </div>

                    {/* Tab Content */}
                    {activeTab === 'send' && (
                        <div className="tab-content">
                            {sending && <div className="alert alert-info">Sending emails...</div>}
                            {completed && <div className="alert alert-success">All emails sent successfully!</div>}

                            <div className="send-email-container">
                                <div className="form-group">
                                    <label htmlFor="batch-size">Select Batch Size:</label>
                                    <select
                                        id="batch-size"
                                        className="form-control"
                                        value={batchSize}
                                        onChange={(e) => setBatchSize(e.target.value)}
                                    >
                                        <option value="100">100</option>
                                        <option value="150">150</option>
                                        <option value="200">200</option>
                                        <option value="250">250</option>
                                        <option value="300">300</option>
                                        <option value="350">350</option>
                                        <option value="400">400</option>
                                    </select>
                                </div>

                                <button
                                    className="btn btn-info"
                                    onClick={handleSendEmails}
                                    disabled={sending}
                                >
                                    {sending ? 'Sending...' : 'Send Emails'}
                                </button>
                                <div className="progress">
                                <div
                                    className="progress-bar"
                                    role="progressbar"
                                    aria-valuenow={emailsSent}
                                    aria-valuemin="0"
                                    aria-valuemax={emails.length}
                                    style={{ width: emails.length > 0 ? `${((emailsSent + emailsFailed) / emails.length) * 100}%` : '0%' }}
                                >
                                    {emails.length > 0 ? `${Math.round(((emailsSent + emailsFailed) / emails.length) * 100)}%` : '0%'}
                                </div>
                                    </div>
                                <div className="email-stats">
                                    <p className="Counter emailsSent counterEmails">Emails Sent:<span className='numberEmailSent'> {emailsSent}</span>
                                    <button
                                        className="btn btn-success btnFailed"
                                        onClick={() => Swal.fire({
                                            title: 'Sent Emails',
                                            html: `<ul>${sentEmailsList.map(email => `<li>${email}</li>`).join('')}</ul>`,
                                            width: '400px',
                                            scrollbarPadding: false,
                                        })}
                                    >
                                        Show Emails ({emailsSent})
                                    </button>
                                    </p>
                                    <p className="Counter emailsFailed counterFailed">Emails Failed: <span className='numberEmailFailed'>{emailsFailed}</span>
                                    <button
                                    className="btn btn-danger btnFailed"
                                    onClick={() => Swal.fire({
                                        title: 'Failed Emails',
                                        html: `<ul>${failedEmailsList.map(failure => `<li>Email: ${failure.email} (Sent from: ${failure.account})</li>`).join('')}</ul>`,
                                        width: '400px',
                                        scrollbarPadding: false,
                                           })}
                                         >
                                    Show Emails ({emailsFailed})
                                     </button>
                                    </p>
                                    <p className="Counter uniqueOpens counterOpens">Unique Opens: <span className='numberEmailOpens'>{uniqueOpens}</span>  
                                    <button
                                        className="btn btn-info btnFailed"
                                        onClick={() => Swal.fire({
                                            title: 'Opened Emails',
                                            html: `<ul>${openedEmailsList.map(email => `<li>${email}</li>`).join('')}</ul>`,
                                            width: '400px',
                                            scrollbarPadding: false,
                                        })}
                                    >
                                        Show Emails ({uniqueOpens})
                                    </button>
                                     </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'upload' && (
                       <div className="tab-content">
                       <h2>Upload Email List</h2>
                       <input type="file" accept=".xlsx, .xls" className="form-control" onChange={handleFileUpload} />
                       <div className="mt-3">
                            <label>Total Emails Uploaded:</label>
                            <input
                                type="text"
                                className="form-control"
                                value={emails.length}
                                readOnly
                            />
                        </div>
                       <table className="table mt-3">
                           <thead>
                               <tr>
                                   <th>Email</th>
                                   <th>Actions</th>
                               </tr>
                           </thead>
                           <tbody>
                               {emails.map((email, index) => (
                                   <tr key={index}>
                                       <td>{email}</td>
                                       <td>
                                           <button className="btn btn-danger" onClick={() => handleDelete(email)}>Delete</button>
                                       </td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                   </div>
                    )}

                    {activeTab === 'template' && (
                        <div className="tab-content">
                            <h2>Email Template</h2>
                            <div className="form-group">
                                    <label htmlFor="from-email">From:</label>
                                    <input
                                        type="email"
                                        id="from-email"
                                        className="form-control"
                                        value={fromEmail}
                                        onChange={(e) => setFromEmail(e.target.value)}
                                        placeholder="Enter the 'From' email address"
                                    />
                                </div>
                            <div className="form-group">
                                <label htmlFor="email-subject">Subject:</label>
                                <input
                                    type="text"
                                    id="email-subject"
                                    className="form-control"
                                    value={emailSubject}
                                    onChange={(e) => setEmailSubject(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="email-body">Body:</label>
                                <Editor
                                   apiKey='poedw245058rbp7rco0iugbw4y976phgofsdb97nwd7o2svn'
                                   init={{
                                       plugins: [
                                           'anchor', 'autolink', 'charmap', 'codesample', 'emoticons', 'image', 'link', 'lists', 'media', 'searchreplace', 'table', 'visualblocks', 'wordcount',
                                          
                                       ],
                                       toolbar: 'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | link image media table mergetags | addcomment showcomments | spellcheckdialog a11ycheck typography | align lineheight | checklist numlist bullist indent outdent | emoticons charmap | removeformat',
                                       tinycomments_mode: 'embedded',
                                       tinycomments_author: 'Author name',
                                       mergetags_list: [
                                           { value: 'First.Name', title: 'First Name' },
                                           { value: 'Email', title: 'Email' },
                                       ],
                                   }}
                                    value={emailBody}
                                    onEditorChange={(newText) => setEmailBody(newText)}
                                />
                            </div>
                        </div>
                    )}

                          {activeTab === 'addMails' && (
                        <div className="tab-content">
                            <h2>Add Email Accounts</h2>
                            <div className="form-group">
                                <label>Email:</label>
                                <input type="email" className="form-control" value={newEmailUser} onChange={(e) => setNewEmailUser(e.target.value)} placeholder="Enter new email" />
                            </div>
                            <div className="form-group">
                                <label>Password:</label>
                                <input type="password" className="form-control" value={newEmailPass} onChange={(e) => setNewEmailPass(e.target.value)} placeholder="Enter email password" />
                            </div>
                            <div className="form-group">
                                <label>SMTP Host:</label>
                                <input type="text" className="form-control" value={newEmailHost} onChange={(e) => setNewEmailHost(e.target.value)} placeholder="Enter SMTP host" />
                            </div>
                            <div className="form-group">
                                <label>SMTP Port:</label>
                                <input type="number" className="form-control" value={newEmailPort} onChange={(e) => setNewEmailPort(e.target.value)} placeholder="Enter SMTP port" />
                            </div>
                            <div className="form-group">
                                <label>Use SSL:</label>
                                <input type="checkbox" className="form-check-input" checked={newEmailSSL} onChange={(e) => setNewEmailSSL(e.target.checked)} />
                            </div>
                            <button className="btn btn-primary" onClick={handleAddEmailAccount}>Add Email Account</button>

                            <h3>Upload Excel File</h3>
                            <input type="file" accept=".xlsx, .xls" onChange={uploadedSMTP} className="form-control" />

                            {uploadedData.length > 0 && (
    <div className="mt-3">
        <h4>Uploaded Email Accounts Preview (Pending Save)</h4>
        <table className="table">
            <thead>
                <tr>
                    <th>Email</th>
                    <th>SMTP Host</th>
                    <th>SMTP Port</th>
                    <th>SSL</th>
                </tr>
            </thead>
            <tbody>
                {uploadedData.map((account, idx) => (
                    <tr key={idx}>
                        <td>{account.user}</td>
                        <td>{account.host}</td>
                        <td>{account.port}</td> 
                        <td>{account.isSSL ? 'Yes' : 'No'}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
)}

        <h3>Current Email Accounts</h3>
        <table className="table mt-3">
            <thead>
                <tr>
                    <th>Email Account</th>
                    <th>SMTP Host</th>
                    <th>SMTP Port</th>
                    <th>SSL</th>
                    <th>Test SMTP</th>
                    <th>Delete Account</th>
                </tr>
            </thead>
            <tbody>
                {emailAccounts.map((accounts, index) => (
                    <tr key={index}>
                        <td>{accounts.user}</td>
                        <td>{accounts.host}</td>
                        <td>{accounts.port}</td>
                        <td>{accounts.isSSL ? 'Yes' : 'No'}</td>
                        <td>
                            <button className="btn btn-info" onClick={() => handleTestSMTP(accounts)}>Test</button>
                        </td>
                        <td>
                            <button className="btn btn-danger" onClick={() => handleDeleteEmailAccount(accounts.user)}>Delete</button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
                                )}

                </div>
            )}
        </>
    );
};

export default Header;

