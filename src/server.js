// src/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const dgram = require('dgram'); // Materi 1 & 3: Socket & UDP/TCP
const { Worker } = require('worker_threads'); // Materi 4: Thread
const DeviceDetector = require('device-detector-js');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server); // Materi 2: WebSocket
const deviceDetector = new DeviceDetector();

app.use(express.json());
app.use(express.static('public'));

// --- SIMULASI DATABASE ---
const users = [
    { id: 1, username: 'admin_rental', password: '123', role: 'ADMIN' },
    { id: 2, username: 'peminjam_01', password: '123', role: 'PEMINJAM', carId: 'MOBIL_A' }
];

const cars = {
    'MOBIL_A': { id: 'MOBIL_A', status: 'Dalam Pemakaian', lat: -6.2, lng: 106.8, speed: 0, alert: 'SAFE' },
    'MOBIL_B': { id: 'MOBIL_B', status: 'Tersedia', lat: -6.2, lng: 106.8, speed: 0, alert: 'SAFE' }
};

// --- 1. API LOGIN DENGAN JWT & DETEKSI DEVICE (Materi 5 & Tambahan) ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        // Deteksi Perangkat
        const userAgent = req.headers['user-agent'];
        const device = deviceDetector.parse(userAgent);
        const deviceInfo = `${device.os.name} - ${device.client.name} (${device.device.type})`;

        // Generate Token JWT
        const token = jwt.sign({ 
            userId: user.id, 
            role: user.role, 
            carId: user.carId || null,
            device: deviceInfo
        }, process.env.JWT_SECRET, { expiresIn: '2h' });

        console.log(`[AUTH] ${username} login via ${deviceInfo}`);
        return res.json({ token, role: user.role, device: deviceInfo });
    }
    res.status(401).json({ message: 'Login Gagal' });
});

// --- 2. SOCKET UDP UNTUK PENERIMAAN DATA IOT (Materi 3 & 6) ---
const udpServer = dgram.createSocket('udp4');

udpServer.on('message', (msg) => {
    try {
        const data = JSON.parse(msg.toString()); // Data: { carId, lat, lng, speed }
        
        if (cars[data.carId]) {
            // --- 3. WORKER THREAD UNTUK PROSES BERAT (Materi 4) ---
            // Menghitung Geofencing di thread terpisah agar server tidak lag
            const worker = new Worker('./src/worker_calc.js', { workerData: data });

            worker.on('message', (calcResult) => {
                // Update data mobil dengan hasil kalkulasi dari worker
                cars[data.carId] = { 
                    ...cars[data.carId], 
                    ...data, 
                    alert: calcResult.areaStatus,
                    isOverSpeed: calcResult.isOverSpeed 
                };

                // Kirim Update via WebSocket (Materi 2)
                // Ke Admin: Semua data mobil
                io.to('ADMIN_ROOM').emit('update_all_cars', cars);

                // Ke Peminjam: Hanya data mobil yang disewa
                io.to(`CAR_${data.carId}`).emit('update_my_car', cars[data.carId]);

                // Kirim Alert Spesifik ke Admin jika bahaya
                if (calcResult.areaStatus === "OUT_OF_BOUNDS" || calcResult.isOverSpeed) {
                    io.to('ADMIN_ROOM').emit('critical_alert', {
                        msg: `PERINGATAN: ${data.carId} melanggar aturan!`,
                        detail: calcResult
                    });
                }
            });

            worker.on('error', (err) => console.error('Worker Error:', err));
        }
    } catch (e) {
        console.error("Gagal memproses data UDP:", e.message);
    }
});

// --- 4. WEBSOCKET MIDDLEWARE & CONNECTION ---
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error('Invalid token'));
        socket.user = decoded; // Menyimpan data user (termasuk device info) ke socket
        next();
    });
});

io.on('connection', (socket) => {
    const { userId, role, carId, device } = socket.user;
    console.log(`[WS] User Terhubung: ${userId} menggunakan ${device}`);

    if (role === 'ADMIN') {
        socket.join('ADMIN_ROOM');
    } else if (carId) {
        socket.join(`CAR_${carId}`);
        
        // CATAT DEVICE KE DALAM OBJEK MOBIL AGAR ADMIN BISA MELIHATNYA
        if (cars[carId]) {
            cars[carId].connectedDevice = device;
            // Kirim update ke admin bahwa ada device yang baru terhubung
            io.to('ADMIN_ROOM').emit('update_all_cars', cars);
        }
    }

    socket.on('disconnect', () => {
        console.log(`[WS] User Terputus: ${userId}`);
        // Opsional: Hapus info device saat logout
        if (role === 'PEMINJAM' && carId && cars[carId]) {
            cars[carId].connectedDevice = "Offline";
            io.to('ADMIN_ROOM').emit('update_all_cars', cars);
        }
    });
});

// --- 5. JALANKAN SERVER ---
const HTTP_PORT = process.env.PORT_HTTP || 3000;
const UDP_PORT = process.env.PORT_UDP || 4000;

server.listen(HTTP_PORT, () => {
    console.log(`\n==========================================`);
    console.log(`🚀 RENTAL SERVER RUNNING ON PORT ${HTTP_PORT}`);
    console.log(`📡 UDP IOT LISTENER ON PORT ${UDP_PORT}`);
    console.log(`==========================================\n`);
});

udpServer.bind(UDP_PORT);