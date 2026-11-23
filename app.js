const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const http = require('http');
const cors = require('cors');
const userRoutes = require('./routes/users');
const socket = require('./socket/init');

const helmet = require('helmet');
dotenv.config();

const app = express();
const server = http.createServer(app);
const corsOptions = {
  origin: 'http://localhost:8080',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // فعّلها إذا كنت ترسل cookies أو credentials
};
app.use(cors(corsOptions));
// لدعم JSON
app.use(express.json());
app.use(express.static('public'));



app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));


app.use('/images', express.static(path.join(__dirname, 'images')));
// راوتر المستخدمين
app.use('/api/users', userRoutes);
app.use('/api/auth/', require('./routes/auth'));
app.use('/api/profile', require('./routes/users'));
app.use('/api/request', require('./routes/requestions'));
app.use('/api/admin',require('./routes/admin'));
app.use('/api/overseer',require('./routes/overseer'))
app.use('/api/conversations',require('./routes/conversations'))
app.use('/api/reports',require('./routes/reports'));
app.use('/api/posts',require('./routes/posts'))
app.use('/api/posts/comments',require('./routes/comments'))
app.use('/api/dashboard',require('./routes/dashbord'))
app.use('/api/advertisements',require('./routes/advertisements'))
// ==============
app.use('/api/ai', require('./routes/ai'));

// روت تدريب اول مودلليتنبأ بامكانية معالجة الحالة 
app.use('/api/ml', require('./ml/routes/mlRoutes'));

// تدريب مودل على توقع نوع الحالة 
app.use('/api/treatment-ml', require('./ml-treatment/routes/treatmentRoutes'));



// خطأ 404 لأي راوتر آخر
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('❌', req.method, req.originalUrl, err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ status: 'error', message: err.message || 'خطأ داخلي في الخادم' });
});
// اتصال قاعدة البيانات
require('./config/db')();

// تهيئة socket.io
const io = socket.init(server);

// استماع على الاتصالات
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('registerPatient', (patientId) => {
    socket.join(patientId.toString()); // يدخل غرفة باسم patientId
    console.log(`Patient ${patientId} joined room`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});
module.exports=io


const PORT = process.env.PORT ;
server.listen(PORT,'0.0.0.0', () => console.log(`Server running on port ${PORT}`));
