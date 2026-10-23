const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const multer = require('multer');
require('dotenv').config();

// ------------------------- File upload setup -------------------------
const uploadDirectory = path.join(__dirname, 'uploads');
const allowedImageTypes = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp']
};
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDirectory),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `complaint-${Date.now()}-${crypto.randomUUID()}${ext}`);
  }
});

function fileFilter(req, file, cb) {
  const allowedExtensions = allowedImageTypes[file.mimetype];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions && allowedExtensions.includes(ext)) return cb(null, true);
  const error = new Error('Only JPEG, PNG, or WebP images are allowed.');
  error.code = 'INVALID_IMAGE_TYPE';
  cb(error);
}

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 4, parts: 5, fieldSize: 1000 },
  fileFilter
});

// ------------------------- App and database setup -------------------------
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = 'roms_db';
const client = new MongoClient(MONGO_URI);
let users;
let complaints;
let notices;
let visitors;
let rents;

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('Set SESSION_SECRET to a random value with at least 32 characters in your .env file.');
}

app.use(express.json({ limit: '20kb' }));
app.use(session({
  name: 'roms.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI, dbName: DB_NAME, collectionName: 'sessions' }),
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 8 * 60 * 60 * 1000 }
}));

// ------------------------- Helpers -------------------------
function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ message: 'Please log in first.' });
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ message: 'Please log in first.' });
    if (req.session.user.role !== role) return res.status(403).json({ message: 'You do not have permission for this action.' });
    next();
  };
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function publicUser(user) {
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role, room: user.room || '' };
}

// ------------------------- Auth routes -------------------------
// Public signup always creates a tenant account. The owner account is
// pre-created from .env values when the server starts.
app.post('/api/auth/signup', async (req, res) => {
  try {
    const body = req.body || {};
    const name = clean(body.name);
    const email = clean(body.email).toLowerCase();
    const room = clean(body.room);
    const password = typeof body.password === 'string' ? body.password : '';
    if (name.length < 2 || name.length > 60) return res.status(400).json({ message: 'Name must be between 2 and 60 characters.' });
    if (!validEmail(email) || email.length > 120) return res.status(400).json({ message: 'Enter a valid email address.' });
    if (room.length < 1 || room.length > 20) return res.status(400).json({ message: 'Enter your room number (1 to 20 characters).' });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    if (await users.findOne({ email })) return res.status(409).json({ message: 'An account with this email already exists.' });

    const user = { name, email, room, passwordHash: await bcrypt.hash(password, 10), role: 'tenant', createdAt: new Date() };
    await users.insertOne(user);
    res.status(201).json({ message: 'Account created successfully. Please sign in with your new account.' });
  } catch (error) {
    console.error('Signup error:', error.message);
    res.status(500).json({ message: 'Could not create your account. Please try again.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const body = req.body || {};
    const email = clean(body.email).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    if (!validEmail(email) || !password) return res.status(400).json({ message: 'Enter your email and password.' });
    const user = await users.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    req.session.regenerate((error) => {
      if (error) return res.status(500).json({ message: 'Could not start your session.' });
      req.session.user = publicUser(user);
      res.json({ user: req.session.user });
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Could not log in. Please try again.' });
  }
});

app.get('/api/auth/me', requireLogin, (req, res) => res.json({ user: req.session.user }));

app.post('/api/auth/logout', requireLogin, (req, res) => {
  req.session.destroy((error) => {
    if (error) return res.status(500).json({ message: 'Could not log out.' });
    res.clearCookie('roms.sid');
    res.json({ message: 'Logged out.' });
  });
});

// Update signed-in user profile: display name and (for tenants) room number
app.patch('/api/auth/profile', requireLogin, async (req, res) => {
  try {
    const body = req.body || {};
    const name = clean(body.name);
    const room = clean(body.room);
    if (name.length < 2 || name.length > 60) {
      return res.status(400).json({ message: 'Name must be between 2 and 60 characters.' });
    }
    if (req.session.user.role === 'tenant' && (room.length < 1 || room.length > 20)) {
      return res.status(400).json({ message: 'Room number must be between 1 and 20 characters.' });
    }
    const setObj = { name, updatedAt: new Date() };
    if (req.session.user.role === 'tenant') setObj.room = room;
    const result = await users.updateOne({ _id: new ObjectId(req.session.user.id) }, { $set: setObj });
    if (!result.matchedCount) return res.status(404).json({ message: 'User account not found.' });
    req.session.user.name = name;
    if (req.session.user.role === 'tenant') req.session.user.room = room;
    res.json({ message: 'Profile updated successfully.', user: req.session.user });
  } catch (error) {
    console.error('Profile update error:', error.message);
    res.status(500).json({ message: 'Could not update profile.' });
  }
});

// Change signed-in user password with current password verification
app.patch('/api/auth/password', requireLogin, async (req, res) => {
  try {
    const body = req.body || {};
    const currPass = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPass = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (!currPass || !newPass) {
      return res.status(400).json({ message: 'Enter your current password and new password.' });
    }
    if (newPass.length < 8 || newPass.length > 72) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }
    const user = await users.findOne({ _id: new ObjectId(req.session.user.id) });
    if (!user) return res.status(404).json({ message: 'User account not found.' });
    const isMatch = await bcrypt.compare(currPass, user.passwordHash);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect.' });
    await users.updateOne(
      { _id: new ObjectId(req.session.user.id) },
      { $set: { passwordHash: await bcrypt.hash(newPass, 10), updatedAt: new Date() } }
    );
    res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Password change error:', error.message);
    res.status(500).json({ message: 'Could not update password.' });
  }
});

// ------------------------- Complaint routes -------------------------
const complaintCategories = ['Plumbing', 'Electrical', 'Housekeeping', 'Security', 'Other'];

async function removeUploadedFile(file) {
  if (!file) return;
  try {
    await fs.unlink(file.path);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Complaint photo cleanup error:', error.message);
  }
}

app.get('/api/tenant/complaints', requireRole('tenant'), async (req, res) => {
  try {
    const records = await complaints.find({ tenantId: req.session.user.id }).sort({ createdAt: -1 }).toArray();
    res.json(records.map((doc) => ({
      _id: doc._id.toString(),
      title: doc.title,
      category: doc.category,
      room: doc.room,
      description: doc.description,
      status: doc.status,
      imageUrl: doc.imageUrl,
      createdAt: doc.createdAt
    })));
  } catch (error) {
    console.error('Tenant complaint list error:', error.message);
    res.status(500).json({ message: 'Could not load your complaints.' });
  }
});

app.post('/api/tenant/complaints', requireRole('tenant'), (req, res) => {
  upload.single('image')(req, res, async (uploadError) => {
    if (uploadError) {
      if (uploadError.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'Image must be 2 MB or smaller.' });
      }
      if (uploadError.code === 'INVALID_IMAGE_TYPE') {
        return res.status(400).json({ message: uploadError.message });
      }
      if (uploadError instanceof multer.MulterError) {
        return res.status(400).json({ message: 'Submit one photo and the required complaint fields.' });
      }
      console.error('Complaint upload error:', uploadError.message);
      return res.status(500).json({ message: 'Could not upload the photo.' });
    }

    let savedImage = false;
    try {
      const body = req.body || {};
      const title = clean(body.title);
      const category = clean(body.category);
      const room = clean(body.room);
      const description = clean(body.description);
      if (title.length < 3 || title.length > 100) return res.status(400).json({ message: 'Title must be between 3 and 100 characters.' });
      if (!complaintCategories.includes(category)) return res.status(400).json({ message: 'Choose a valid category.' });
      if (room.length < 1 || room.length > 20) return res.status(400).json({ message: 'Room number must be between 1 and 20 characters.' });
      if (description.length < 10 || description.length > 1000) return res.status(400).json({ message: 'Description must be between 10 and 1000 characters.' });

      const doc = {
        title,
        category,
        room,
        description,
        status: 'Reported',
        imageUrl: req.file ? `uploads/${req.file.filename}` : null,
        tenantId: req.session.user.id,
        tenantName: req.session.user.name,
        createdAt: new Date()
      };
      const result = await complaints.insertOne(doc);
      savedImage = Boolean(req.file);
      res.status(201).json({ complaint: { ...doc, _id: result.insertedId.toString() } });
    } catch (error) {
      console.error('Complaint create error:', error.message);
      res.status(500).json({ message: 'Could not save this complaint.' });
    } finally {
      if (!savedImage) await removeUploadedFile(req.file);
    }
  });
});

app.get('/api/owner/complaints', requireRole('owner'), async (req, res) => {
  try {
    const records = await complaints.find().sort({ createdAt: -1 }).toArray();
    res.json(records.map((doc) => ({
      _id: doc._id.toString(),
      title: doc.title,
      category: doc.category,
      room: doc.room,
      description: doc.description,
      status: doc.status,
      imageUrl: doc.imageUrl,
      tenantId: doc.tenantId,
      tenantName: doc.tenantName || 'Tenant',
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    })));
  } catch (error) {
    console.error('Owner complaint list error:', error.message);
    res.status(500).json({ message: 'Could not load complaints.' });
  }
});

app.patch('/api/owner/complaints/:id/status', requireRole('owner'), async (req, res) => {
  try {
    const { id } = req.params;
    const status = req.body && req.body.status;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid complaint ID.' });
    if (!['Reported', 'In Progress', 'Resolved'].includes(status)) {
      return res.status(400).json({ message: 'Choose a valid status.' });
    }
    const result = await complaints.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } }
    );
    if (!result.matchedCount) return res.status(404).json({ message: 'Complaint not found.' });
    res.json({ message: 'Complaint status updated.' });
  } catch (error) {
    console.error('Complaint status update error:', error.message);
    res.status(500).json({ message: 'Could not update complaint status.' });
  }
});

// ------------------------- Notice routes -------------------------
app.get('/api/notices', requireLogin, async (req, res) => {
  try {
    const records = await notices.find().sort({ createdAt: -1 }).toArray();
    res.json(records.map((doc) => ({
      _id: doc._id.toString(),
      title: doc.title,
      body: doc.body,
      ownerName: doc.ownerName,
      createdAt: doc.createdAt
    })));
  } catch (error) {
    console.error('Notice list error:', error.message);
    res.status(500).json({ message: 'Could not load notices.' });
  }
});

app.post('/api/notices', requireRole('owner'), async (req, res) => {
  try {
    const body = req.body || {};
    const title = clean(body.title);
    const text = clean(body.body);
    if (title.length < 3 || title.length > 80) return res.status(400).json({ message: 'Notice title must be between 3 and 80 characters.' });
    if (text.length < 10 || text.length > 500) return res.status(400).json({ message: 'Notice body must be between 10 and 500 characters.' });
    const doc = { title, body: text, ownerName: req.session.user.name, createdAt: new Date() };
    await notices.insertOne(doc);
    res.status(201).json({ notice: { ...doc, _id: doc._id ? doc._id.toString() : null } });
  } catch (error) {
    console.error('Notice create error:', error.message);
    res.status(500).json({ message: 'Could not post the notice.' });
  }
});

app.delete('/api/notices/:id', requireRole('owner'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid notice ID.' });
    const result = await notices.deleteOne({ _id: new ObjectId(id) });
    if (!result.deletedCount) return res.status(404).json({ message: 'Notice not found.' });
    res.json({ message: 'Notice deleted.' });
  } catch (error) {
    console.error('Notice delete error:', error.message);
    res.status(500).json({ message: 'Could not delete the notice.' });
  }
});

// ------------------------- Visitor routes -------------------------
app.get('/api/owner/visitors', requireRole('owner'), async (req, res) => {
  try {
    const records = await visitors.find().sort({ inTime: -1 }).toArray();
    res.json(records.map((doc) => ({
      _id: doc._id.toString(),
      visitorName: doc.visitorName,
      phone: doc.phone || '',
      room: doc.room,
      purpose: doc.purpose,
      inTime: doc.inTime,
      outTime: doc.outTime || null
    })));
  } catch (error) {
    console.error('Owner visitor list error:', error.message);
    res.status(500).json({ message: 'Could not load the visitor log.' });
  }
});

app.post('/api/owner/visitors', requireRole('owner'), async (req, res) => {
  try {
    const body = req.body || {};
    const visitorName = clean(body.visitorName);
    const phone = clean(body.phone);
    const room = clean(body.room);
    const purpose = clean(body.purpose);
    if (visitorName.length < 2 || visitorName.length > 60) return res.status(400).json({ message: 'Visitor name must be between 2 and 60 characters.' });
    if (phone && (phone.length < 6 || phone.length > 15)) return res.status(400).json({ message: 'Phone number must be between 6 and 15 characters.' });
    if (room.length < 1 || room.length > 20) return res.status(400).json({ message: 'Room number must be between 1 and 20 characters.' });
    if (purpose.length < 3 || purpose.length > 100) return res.status(400).json({ message: 'Purpose must be between 3 and 100 characters.' });
    const doc = { visitorName, phone, room, purpose, inTime: new Date(), outTime: null };
    const result = await visitors.insertOne(doc);
    res.status(201).json({ visitor: { ...doc, _id: result.insertedId.toString() } });
  } catch (error) {
    console.error('Visitor create error:', error.message);
    res.status(500).json({ message: 'Could not log the visitor.' });
  }
});

app.patch('/api/owner/visitors/:id/checkout', requireRole('owner'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid visitor ID.' });
    const visitor = await visitors.findOne({ _id: new ObjectId(id) });
    if (!visitor) return res.status(404).json({ message: 'Visitor entry not found.' });
    if (visitor.outTime) return res.status(400).json({ message: 'This visitor has already checked out.' });
    await visitors.updateOne({ _id: new ObjectId(id) }, { $set: { outTime: new Date() } });
    res.json({ message: 'Visitor checked out.' });
  } catch (error) {
    console.error('Visitor checkout error:', error.message);
    res.status(500).json({ message: 'Could not check out the visitor.' });
  }
});

// Tenants only see visitor entries logged for their own room
app.get('/api/tenant/visitors', requireRole('tenant'), async (req, res) => {
  try {
    const room = req.session.user.room || '';
    if (!room) return res.json([]);
    const records = await visitors.find({ room }).sort({ inTime: -1 }).toArray();
    res.json(records.map((doc) => ({
      _id: doc._id.toString(),
      visitorName: doc.visitorName,
      phone: doc.phone || '',
      room: doc.room,
      purpose: doc.purpose,
      inTime: doc.inTime,
      outTime: doc.outTime || null
    })));
  } catch (error) {
    console.error('Tenant visitor list error:', error.message);
    res.status(500).json({ message: 'Could not load your visitors.' });
  }
});

// ------------------------- Rent tracker routes -------------------------
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

app.get('/api/owner/tenants', requireRole('owner'), async (req, res) => {
  try {
    const records = await users.find({ role: 'tenant' }).sort({ room: 1 }).toArray();
    res.json(records.map((user) => ({
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      room: user.room || '',
      createdAt: user.createdAt
    })));
  } catch (error) {
    console.error('Tenant list error:', error.message);
    res.status(500).json({ message: 'Could not load tenants.' });
  }
});

app.get('/api/owner/rents', requireRole('owner'), async (req, res) => {
  try {
    const records = await rents.find().sort({ month: -1, room: 1 }).toArray();
    res.json(records.map((doc) => ({
      _id: doc._id.toString(),
      tenantId: doc.tenantId,
      tenantName: doc.tenantName || 'Tenant',
      room: doc.room,
      month: doc.month,
      amount: doc.amount,
      status: doc.status,
      paidAt: doc.paidAt || null
    })));
  } catch (error) {
    console.error('Owner rent list error:', error.message);
    res.status(500).json({ message: 'Could not load rent records.' });
  }
});

// Generate rent entries for every tenant that does not have one for the month
app.post('/api/owner/rents/generate', requireRole('owner'), async (req, res) => {
  try {
    const body = req.body || {};
    const month = clean(body.month);
    const amount = Number(body.amount);
    if (!monthPattern.test(month)) return res.status(400).json({ message: 'Choose a valid month.' });
    if (!Number.isFinite(amount) || amount < 100 || amount > 1000000) {
      return res.status(400).json({ message: 'Enter a rent amount between 100 and 1000000.' });
    }
    const tenantUsers = await users.find({ role: 'tenant' }).toArray();
    if (!tenantUsers.length) return res.status(400).json({ message: 'There are no tenant accounts yet.' });
    const existing = await rents.find({ month }).toArray();
    const existingIds = new Set(existing.map((doc) => doc.tenantId));
    const newDocs = tenantUsers
      .filter((user) => !existingIds.has(user._id.toString()))
      .map((user) => ({
        tenantId: user._id.toString(),
        tenantName: user.name,
        room: user.room || '',
        month,
        amount,
        status: 'Unpaid',
        paidAt: null,
        createdAt: new Date()
      }));
    if (newDocs.length) await rents.insertMany(newDocs);
    res.status(201).json({ message: `Created ${newDocs.length} rent entries (${tenantUsers.length - newDocs.length} already existed).`, created: newDocs.length });
  } catch (error) {
    console.error('Rent generate error:', error.message);
    res.status(500).json({ message: 'Could not generate rent entries.' });
  }
});

app.patch('/api/owner/rents/:id/status', requireRole('owner'), async (req, res) => {
  try {
    const { id } = req.params;
    const status = req.body && req.body.status;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid rent ID.' });
    if (!['Paid', 'Unpaid'].includes(status)) return res.status(400).json({ message: 'Choose a valid rent status.' });
    const result = await rents.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, paidAt: status === 'Paid' ? new Date() : null } }
    );
    if (!result.matchedCount) return res.status(404).json({ message: 'Rent entry not found.' });
    res.json({ message: 'Rent status updated.' });
  } catch (error) {
    console.error('Rent status update error:', error.message);
    res.status(500).json({ message: 'Could not update rent status.' });
  }
});

app.get('/api/tenant/rents', requireRole('tenant'), async (req, res) => {
  try {
    const records = await rents.find({ tenantId: req.session.user.id }).sort({ month: -1 }).toArray();
    res.json(records.map((doc) => ({
      _id: doc._id.toString(),
      month: doc.month,
      amount: doc.amount,
      status: doc.status,
      paidAt: doc.paidAt || null
    })));
  } catch (error) {
    console.error('Tenant rent list error:', error.message);
    res.status(500).json({ message: 'Could not load your rent records.' });
  }
});

// ------------------------- Page guards and static files -------------------------
app.get('/tenant.html', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  if (req.session.user.role !== 'tenant') return res.redirect('/owner.html');
  res.sendFile(path.join(__dirname, 'tenant.html'));
});

app.get('/owner.html', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  if (req.session.user.role !== 'owner') return res.redirect('/tenant.html');
  res.sendFile(path.join(__dirname, 'owner.html'));
});

app.get('/profile.html', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'profile.html'));
});

app.use('/uploads', express.static(uploadDirectory));
app.use(express.static(__dirname));

// ------------------------- Start -------------------------
function monthString(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function start() {
  await fs.mkdir(uploadDirectory, { recursive: true });
  await client.connect();
  const db = client.db(DB_NAME);
  users = db.collection('users');
  complaints = db.collection('complaints');
  notices = db.collection('notices');
  visitors = db.collection('visitors');
  rents = db.collection('rents');
  await users.createIndex({ email: 1 }, { unique: true });
  await rents.createIndex({ tenantId: 1, month: 1 }, { unique: true });

  // Owner account from local .env values; owners cannot self-register.
  const ownerEmail = clean(process.env.OWNER_EMAIL).toLowerCase();
  const ownerPassword = process.env.OWNER_PASSWORD || '';
  if (ownerEmail && validEmail(ownerEmail) && ownerPassword.length >= 8) {
    await users.updateOne(
      { email: ownerEmail },
      { $setOnInsert: { name: 'Property Owner', email: ownerEmail, role: 'owner', passwordHash: await bcrypt.hash(ownerPassword, 10), createdAt: new Date() } },
      { upsert: true }
    );
  }

  // Demo tenant account so the app has data and can be demoed instantly.
  await users.updateOne(
    { email: 'demo@pg.local' },
    { $setOnInsert: { name: 'Demo Tenant', email: 'demo@pg.local', room: '101', role: 'tenant', passwordHash: await bcrypt.hash('Tenant@123', 10), createdAt: new Date() } },
    { upsert: true }
  );
  const demoTenant = await users.findOne({ email: 'demo@pg.local' });

  // Seed sample data on first run so every module has something to show.
  if (await complaints.countDocuments() === 0) {
    await complaints.insertMany([
      { title: 'Bathroom geyser not heating', category: 'Plumbing', room: '101', description: 'The geyser in the attached bathroom stopped heating water since Monday morning.', status: 'In Progress', tenantId: demoTenant._id.toString(), tenantName: demoTenant.name, createdAt: new Date(Date.now() - 3 * 3600 * 1000) },
      { title: 'Corridor tube light flickering', category: 'Electrical', room: '101', description: 'The tube light near room 101 flickers constantly and is disturbing everyone at night.', status: 'Reported', tenantId: demoTenant._id.toString(), tenantName: demoTenant.name, createdAt: new Date(Date.now() - 2 * 3600 * 1000) },
      { title: 'Window mosquito net torn', category: 'Housekeeping', room: '102', description: 'The mosquito net on the balcony window is torn and mosquitoes are coming in.', status: 'Reported', tenantId: null, tenantName: 'R. Sharma', createdAt: new Date(Date.now() - 26 * 3600 * 1000) }
    ]);
  }

  if (await notices.countDocuments() === 0) {
    await notices.insertMany([
      { title: 'Water supply maintenance on Saturday', body: 'Water supply will be stopped from 10 AM to 2 PM this Saturday for tank cleaning. Please store water in advance.', ownerName: 'Property Owner', createdAt: new Date(Date.now() - 5 * 3600 * 1000) },
      { title: 'Rent for this month is due by the 5th', body: 'Kindly pay the monthly rent before the 5th. Pay at the owner office or transfer by UPI and collect the receipt.', ownerName: 'Property Owner', createdAt: new Date(Date.now() - 30 * 3600 * 1000) }
    ]);
  }

  if (await visitors.countDocuments() === 0) {
    await visitors.insertMany([
      { visitorName: 'Priya Verma', phone: '98765 43210', room: '101', purpose: 'Family visit', inTime: new Date(Date.now() - 4 * 3600 * 1000), outTime: new Date(Date.now() - 2 * 3600 * 1000) },
      { visitorName: 'Ravi Kumar', phone: '91234 56789', room: '101', purpose: 'Food delivery', inTime: new Date(Date.now() - 30 * 60 * 1000), outTime: null }
    ]);
  }

  if (await rents.countDocuments() === 0) {
    await rents.insertMany([
      { tenantId: demoTenant._id.toString(), tenantName: demoTenant.name, room: '101', month: monthString(-1), amount: 6000, status: 'Paid', paidAt: new Date(Date.now() - 20 * 24 * 3600 * 1000), createdAt: new Date(Date.now() - 32 * 24 * 3600 * 1000) },
      { tenantId: demoTenant._id.toString(), tenantName: demoTenant.name, room: '101', month: monthString(0), amount: 6000, status: 'Unpaid', paidAt: null, createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) },
      { tenantId: null, tenantName: 'R. Sharma', room: '102', month: monthString(0), amount: 6500, status: 'Unpaid', paidAt: null, createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) }
    ]);
  }

  app.listen(PORT, () => console.log(`Residential Operations & Management System running at http://localhost:${PORT}`));
}

start().catch((error) => {
  console.error('Could not start the app. Check that local MongoDB is running and .env is configured.');
  console.error(error.message);
  process.exit(1);
});
