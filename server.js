/**
 * Backend server for Cotizaciones y Pedidos system
 * Technologies used:
 * - Node.js
 * - Express.js
 * - Multer for file uploads
 * - Nodemailer (mock email logs)
 * 
 * To run:
 * 1. npm init -y
 * 2. npm install express multer cors body-parser nodemailer
 * 3. node server.js
 * 
 * The backend stores data in-memory for demo purposes.
 * For production, replace with DB persistence.
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Static folder for uploaded files
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}
app.use('/uploads', express.static(UPLOAD_DIR));

// Setup multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Save with timestamp and original name to avoid clashes
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, uniqueSuffix + '-' + safeName);
  },
});
const upload = multer({ storage });

// In-memory data stores (replace with DB in real project)
const users = [
  // password is plaintext for demo only; in real-world use hashed passwords and auth tokens
  { id: 'user1', email: 'cliente@example.com', name: 'Cliente Demo', phone: '123456789', password: 'pass123', role: 'client' },
  { id: 'user2', email: 'empresa@example.com', name: 'Empresa Demo', phone: '987654321', password: 'pass123', role: 'company' },
];

const quotes = []; // quote objects
/*
  Quote schema:
  {
    id: string,
    description: string,
    files: [ { filename: string, originalname: string } ],
    quantity: number,
    measurements: string,
    material: string,
    deadline: string (ISO date),
    clientId: string,
    status: 'pendiente' | 'enviada' | 'aprobada' | 'rechazada',
    quoteDetails: {
      description: string,
      unitPrice: number,
      discount: number,
      tax: number,
      pdfFile: { filename, originalname },
      comments: string
    },
    order: {
      status: 'pendiente' | 'en_produccion' | 'listo_para_recoger',
      responsible: string,
      estimatedCompletionDate: string,
      pickupInfo: string
    },
    messages: [ { from: 'client'|'company', text: string, timestamp: number } ],
    createdAt: number
  }
*/

// Authentication middleware (simplified)
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });
  // Basic <base64 encoded user:pass>
  const base64Credentials = authHeader.split(' ')[1];
  if (!base64Credentials) return res.status(401).json({ error: 'Malformed Authorization header' });
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [email, password] = credentials.split(':');
  const user = users.find((u) => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  req.user = user;
  next();
}

// Nodemailer transporter (for demo logs only)
const transporter = nodemailer.createTransport({
  jsonTransport: true, // for testing — outputs info to console
});

// --- ROUTES ---

// Test route
app.get('/', (req, res) => {
  res.send('API de Cotizaciones y Pedidos - Backend funcionando');
});

// Login endpoint (demo)
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find((u) => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
  // Return user info and dummy token (real apps use JWT or session)
  res.json({ 
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    token: Buffer.from(email + ':' + password).toString('base64'),
  });
});

// Get profile
app.get('/api/profile', authenticate, (req, res) => {
  const { id, name, email, phone, role } = req.user;
  res.json({ id, name, email, phone, role });
});

// Update profile
app.put('/api/profile', authenticate, (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
  const user = users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  user.name = name;
  user.phone = phone;
  res.json({ message: 'Perfil actualizado' });
});

// Upload files endpoint for quote attachments or PDF
app.post('/api/files/upload', authenticate, upload.array('files', 5), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No se subieron archivos' });
  }
  // Return original and saved filenames
  const filesInfo = req.files.map(f => ({
    filename: f.filename,
    originalname: f.originalname,
    url: '/uploads/' + f.filename,
  }));
  res.json(filesInfo);
});

// Create a new quote request (client)
app.post('/api/quotes', authenticate, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Solo clientes pueden crear solicitudes' });
  const {
    description,
    files,
    quantity,
    measurements,
    material,
    deadline,
  } = req.body;
  if (!description || !quantity) {
    return res.status(400).json({ error: 'Descripción y cantidad son obligatorias' });
  }
  const newQuote = {
    id: 'q_' + Date.now() + '_' + Math.round(Math.random()*9999),
    description,
    files: Array.isArray(files) ? files : [],
    quantity: Number(quantity),
    measurements: measurements || '',
    material: material || '',
    deadline: deadline || null,
    clientId: req.user.id,
    status: 'pendiente',
    quoteDetails: null,
    order: null,
    messages: [],
    createdAt: Date.now(),
  };
  quotes.push(newQuote);

  // Simulate sending email notification to company (console log)
  transporter.sendMail({
    from: 'no-reply@empresa.com',
    to: 'empresa@example.com',
    subject: 'Nueva solicitud de cotización',
    text: `Nuevo pedido de cotización de ${req.user.name} (${req.user.email}). Descripción: ${description}`,
  }, (err, info) => {
    if (err) {
      console.error('Error enviando correo:', err);
    } else {
      console.log('Correo enviado (simulado):', info.message);
    }
  });

  res.status(201).json(newQuote);
});

// List quotes (filtered by user role)
app.get('/api/quotes', authenticate, (req, res) => {
  if (req.user.role === 'client') {
    const userQuotes = quotes.filter(q => q.clientId === req.user.id);
    res.json(userQuotes);
  } else if (req.user.role === 'company') {
    res.json(quotes);
  } else {
    res.status(403).json({ error: 'Rol no autorizado' });
  }
});

// Get quote by id
app.get('/api/quotes/:id', authenticate, (req, res) => {
  const q = quotes.find(q => q.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'Cotización no encontrada' });
  if (req.user.role === 'client' && q.clientId !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  res.json(q);
});

// Update quote (only company can update essential quote data/status)
app.put('/api/quotes/:id', authenticate, (req, res) => {
  if (req.user.role !== 'company') return res.status(403).json({ error: 'Solo empresa puede actualizar cotizaciones' });
  const qIndex = quotes.findIndex(q => q.id === req.params.id);
  if (qIndex === -1) return res.status(404).json({ error: 'Cotización no encontrada' });

  const {
    status,
    quoteDetails,
    order,
  } = req.body;

  // Update fields safely
  if (status) quotes[qIndex].status = status;
  if (quoteDetails) quotes[qIndex].quoteDetails = quoteDetails;
  if (order) quotes[qIndex].order = order;

  // Simulate sending email notification to client on quote status change to 'enviada' or 'aprobada' or order ready
  const quote = quotes[qIndex];
  let sendEmail = false;
  let subject = '';
  let text = '';
  if (status === 'enviada') {
    sendEmail = true;
    subject = 'Cotización disponible';
    text = `Hola ${req.user.name},\n\nSu cotización con id ${quote.id} ha sido enviada. Por favor revise la plataforma.\n\nSaludos.`;
  } else if (status === 'aprobada') {
    sendEmail = true;
    subject = 'Cotización aprobada';
    text = `Hola ${req.user.name},\n\nSu cotización con id ${quote.id} ha sido aprobada.\n\nSaludos.`;
  } else if (order && order.status === 'listo_para_recoger') {
    sendEmail = true;
    subject = 'Pedido listo para recoger';
    text = `Hola ${req.user.name},\n\nSu pedido con id ${quote.id} está listo para ser recogido.\nLugar: ${order.pickupInfo || 'No especificado'}.\n\nSaludos.`;
  }
  if (sendEmail) {
    const client = users.find(u => u.id === quote.clientId);
    if (client) {
      transporter.sendMail({
        from: 'no-reply@empresa.com',
        to: client.email,
        subject,
        text,
      }, (err, info) => {
        if (err) {
          console.error('Error enviando correo:', err);
        } else {
          console.log('Correo enviado (simulado):', info.message);
        }
      });
    }
  }

  res.json(quotes[qIndex]);
});

// Add message to quote conversation
app.post('/api/quotes/:id/messages', authenticate, (req, res) => {
  const q = quotes.find(q => q.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'Cotización no encontrada' });

  // Clients can only message their own quotes
  if (req.user.role === 'client' && q.clientId !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  // Message text required
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'El mensaje es obligatorio' });

  q.messages.push({
    from: req.user.role, // 'client' or 'company'
    text: text.trim(),
    timestamp: Date.now(),
  });

  res.status(201).json({ message: 'Mensaje agregado' });
});

// Get messages for a quote
app.get('/api/quotes/:id/messages', authenticate, (req, res) => {
  const q = quotes.find(q => q.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'Cotización no encontrada' });

  // Clients can only see their own quote messages
  if (req.user.role === 'client' && q.clientId !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  res.json(q.messages);
});

// Get orders (only for company)
app.get('/api/orders', authenticate, (req, res) => {
  if (req.user.role !== 'company') return res.status(403).json({ error: 'Rol no autorizado' });
  // Gather orders embedded in approved quotes
  const orders = quotes.filter(q => q.status === 'aprobada' && q.order).map(q => ({
    quoteId: q.id,
    clientId: q.clientId,
    clientName: users.find(u => u.id === q.clientId)?.name || '',
    clientEmail: users.find(u => u.id === q.clientId)?.email || '',
    description: q.description,
    order: q.order,
  }));
  res.json(orders);
});

// Update an order (company only)
app.put('/api/orders/:quoteId', authenticate, (req, res) => {
  if (req.user.role !== 'company') return res.status(403).json({ error: 'Rol no autorizado' });

  const quoteId = req.params.quoteId;
  const q = quotes.find(q => q.id === quoteId);
  if (!q) return res.status(404).json({ error: 'Cotización no encontrada' });
  if (!q.order) return res.status(400).json({ error: 'No existe orden para esta cotización' });

  const { status, responsible, estimatedCompletionDate, pickupInfo } = req.body;

  if (status) q.order.status = status;
  if (responsible) q.order.responsible = responsible;
  if (estimatedCompletionDate) q.order.estimatedCompletionDate = estimatedCompletionDate;
  if (pickupInfo) q.order.pickupInfo = pickupInfo;

  // If order marked "listo_para_recoger" send notification to client
  if (status === 'listo_para_recoger') {
    const client = users.find(u => u.id === q.clientId);
    if (client) {
      transporter.sendMail({
        from: 'no-reply@empresa.com',
        to: client.email,
        subject: 'Pedido listo para recoger',
        text: `Hola ${client.name},\n\nSu pedido con id ${quoteId} está listo para ser recogido.\nLugar: ${pickupInfo || 'No especificado'}.\n\nSaludos.`,
      }, (err, info) => {
        if (err) {
          console.error('Error enviando correo:', err);
        } else {
          console.log('Correo enviado (simulado):', info.message);
        }
      });
    }
  }

  res.json({ message: 'Orden actualizada', order: q.order });
});

// Start server
app.listen(PORT, () => {
  console.log('Servidor backend API escuchando en http://localhost:' + PORT);
});


