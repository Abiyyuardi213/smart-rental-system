const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const dgram = require('dgram'); 
const { Worker } = require('worker_threads');
const DeviceDetector = require('device-detector-js');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = require('./config/database');

const app = express();

const certPath = path.join(__dirname, '../cert.pem');
const keyPath = path.join(__dirname, '../key.pem');
let httpsOptions = null;

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    try {
        httpsOptions = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath)
        };
        console.log("✅ SSL Certificates Loaded!");
    } catch(e) { console.error("❌ Certificate Load Error:", e.message); }
} else {
    console.warn("⚠️ No SSL Certificates found. Run 'node src/make_cert.js' first.");
}

const server = http.createServer(app);
let httpsServer;

if (httpsOptions.key) {
    httpsServer = https.createServer(httpsOptions, app);
}

const io = socketIo({
    cors: { origin: "*", methods: ["GET", "POST"] }
});
io.attach(server);
if (httpsServer) io.attach(httpsServer);

const deviceDetector = new DeviceDetector();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

let activeCars = {}; 

async function loadCarsBuffer() {
    try {
        const [rows] = await pool.query("SELECT * FROM cars");
        rows.forEach(car => {
            if (!activeCars[car.device_id]) {
                activeCars[car.device_id] = {
                    id: car.device_id,
                    name: car.name,
                    plate: car.plate_number,
                    status: car.status,
                    lat: null, 
                    lng: null, 
                    speed: 0, 
                    alert: 'SAFE',
                    networkStatus: 'Offline',
                    lastSeen: null
                };
            } else {
                activeCars[car.device_id].name = car.name;
                activeCars[car.device_id].plate = car.plate_number;
                activeCars[car.device_id].status = car.status;
            }
        });
        console.log("Create/Update Memory Buffer:", Object.keys(activeCars).length, "cars.");
        io.to('ADMIN_ROOM').emit('update_all_cars', activeCars);
    } catch (err) {
        console.error("Failed to load cars:", err);
    }
}
loadCarsBuffer();


app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await pool.query("SELECT * FROM users WHERE username = ? AND password = ?", [username, password]);
        if (rows.length === 0) return res.status(401).json({ message: 'Login Gagal: Username atau Password salah' });

        const user = rows[0];

        // Device detection
        const userAgent = req.headers['user-agent'] || '';
        const device = deviceDetector.parse(userAgent);
        const deviceInfo = `${device.os && device.os.name?device.os.name:'Unknown'} - ${device.client && device.client.name?device.client.name:'Client'}`;

        let carId = null;
        if (user.role === 'PEMINJAM') {
            const [rentals] = await pool.query(
                "SELECT r.*, c.device_id FROM rentals r JOIN cars c ON r.car_id = c.id WHERE r.user_id = ? AND r.status = 'ACTIVE'", 
                [user.id]
            );
            if (rentals.length > 0) {
                carId = rentals[0].device_id;
            }
        }

        const token = jwt.sign({ 
            userId: user.id, 
            role: user.role,
            status: user.status, // Include status in token
            carId: carId,
            device: deviceInfo
        }, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.json({ 
            token, 
            role: user.role, 
            status: user.status, // Send status to client
            name: user.name,
            device: deviceInfo 
        });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// Register Endpoint
app.post('/api/register', async (req, res) => {
    const { name, email, username, password } = req.body;
    try {
        // Validation
        if (!name || !email || !username || !password) {
            return res.status(400).json({ message: 'Semua field harus diisi' });
        }

        // Check duplicate
        const [existing] = await pool.query("SELECT * FROM users WHERE username = ? OR email = ?", [username, email]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Username atau Email sudah terdaftar' });
        }

        await pool.query(
            "INSERT INTO users (name, email, username, password, role, status) VALUES (?, ?, ?, ?, 'PEMINJAM', 'PENDING')",
            [name, email, username, password]
        );

        res.json({ message: 'Registrasi berhasil! Silakan login untuk melihat status akun Anda.' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// Profile Endpoints
app.get('/api/profile', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Unauthorized' });
    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [rows] = await pool.query("SELECT id, name, username, email, phone, address, profile_pic, status, role FROM users WHERE id = ?", [decoded.userId]);
        
        if (rows.length === 0) return res.status(404).json({ message: 'User not found' });
        res.json(rows[0]);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

const multer = require('multer');


// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, 'profile-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) return cb(null, true);
        cb(new Error("Hanya diperbolehkan format gambar (jpeg, jpg, png, webp)"));
    }
});

// Profile Picture Upload Endpoint
app.post('/api/profile/upload-pic', upload.single('profile_pic'), async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Unauthorized' });
    const token = authHeader.split(" ")[1];

    if (!req.file) return res.status(400).json({ message: 'Tidak ada file yang diunggah' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const fileUrl = '/uploads/' + req.file.filename;

        await pool.query(
            "UPDATE users SET profile_pic = ? WHERE id = ?",
            [fileUrl, decoded.userId]
        );

        res.json({ message: 'Foto profil diperbarui', profile_pic: fileUrl });
    } catch (e) {
        console.error("Upload Error:", e);
        res.status(500).json({ message: e.message });
    }
});

app.post('/api/profile/update', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Unauthorized' });
    const token = authHeader.split(" ")[1];

    // profile_pic might be passed if manually setting a URL, but typically handled by upload-pic now
    const { name, phone, address, profile_pic } = req.body;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Dynamic update query to handle optional fields
        let query = "UPDATE users SET name = ?, phone = ?, address = ?";
        let params = [name, phone, address];

        if (profile_pic !== undefined) {
             query += ", profile_pic = ?";
             params.push(profile_pic);
        }

        query += " WHERE id = ?";
        params.push(decoded.userId);

        await pool.query(query, params);
        res.json({ message: 'Profil berhasil diperbarui' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// Admin User Management Endpoints
app.get('/api/admin/users', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT id, name, username, email, status, role, created_at FROM users WHERE role = 'PEMINJAM' ORDER BY created_at DESC");
        res.json(rows);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.post('/api/admin/users/verify', async (req, res) => {
    const { user_id, action } = req.body; // action: 'APPROVE' or 'REJECT'
    try {
        const status = action === 'APPROVE' ? 'ACTIVE' : 'REJECTED';
        await pool.query("UPDATE users SET status = ? WHERE id = ?", [status, user_id]);
        res.json({ message: `User status updated to ${status}` });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

const apiAuth = (req, res, next) => {
    next();
};

app.get('/api/cars', async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM cars");
    res.json(rows);
});

app.post('/api/cars', upload.single('image'), async (req, res) => {
    const { name, plate_number, device_id } = req.body;
    const image_url = req.file ? '/uploads/' + req.file.filename : null;
    try {
        await pool.query("INSERT INTO cars (name, plate_number, device_id, image_url) VALUES (?, ?, ?, ?)", 
            [name, plate_number, device_id, image_url]);
        await loadCarsBuffer(); // Sync memory
        res.json({ message: 'Mobil ditambahkan' });
    } catch (e) {
        console.error("Add Car Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/cars/:id', upload.single('image'), async (req, res) => {
    const { name, plate_number, device_id } = req.body;
    const id = req.params.id;
    
    try {
        let query = "UPDATE cars SET name = ?, plate_number = ?, device_id = ?";
        let params = [name, plate_number, device_id];

        if (req.file) {
            query += ", image_url = ?";
            params.push('/uploads/' + req.file.filename);
        }

        query += " WHERE id = ?";
        params.push(id);

        await pool.query(query, params);
        
        // Update in-memory buffer if device_id changed or simply to refresh properties
        // Ideally we should remove the old key if device_id changed, but loadCarsBuffer handles refresh
        // For simplicity, just reload all.
        await loadCarsBuffer();

        res.json({ message: 'Data mobil diperbarui' });
    } catch (e) {
        console.error("Update Car Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/cars/:id', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT device_id FROM cars WHERE id = ?", [req.params.id]);
        if (rows.length > 0) delete activeCars[rows[0].device_id];
        
        await pool.query("DELETE FROM cars WHERE id = ?", [req.params.id]);
        res.json({ message: 'Mobil dihapus' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/cars/available', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM cars WHERE status = 'TERSEDIA'");
        res.json(rows);
    } catch (e) {
        res.status(500).json({error:e.message});
    }
});

app.post('/api/rentals', async (req, res) => {
    const { token, car_db_id } = req.body;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        await pool.query("INSERT INTO rentals (user_id, car_id, status) VALUES (?, ?, 'PENDING')", [decoded.userId, car_db_id]);
        
        res.json({ message: 'Permintaan dikirim' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/rentals/pending', async (req, res) => {
    const [rows] = await pool.query(
        `SELECT r.id, u.username, c.name, c.plate_number, r.status, r.created_at 
         FROM rentals r 
         JOIN users u ON r.user_id = u.id 
         JOIN cars c ON r.car_id = c.id 
         WHERE r.status = 'PENDING'`
    );
    res.json(rows);
});

app.post('/api/rentals/approve', async (req, res) => {
    const { rental_id, action } = req.body;
    try {
        const [rentals] = await pool.query("SELECT * FROM rentals WHERE id = ?", [rental_id]);
        if (rentals.length === 0) return res.status(404).json({message: 'Not found'});
        const rental = rentals[0];

        if (action === 'APPROVE') {
            await pool.query("UPDATE rentals SET status = 'ACTIVE' WHERE id = ?", [rental_id]);
            await pool.query("UPDATE cars SET status = 'DISEWA' WHERE id = ?", [rental.car_id]);
        } else {
            await pool.query("UPDATE rentals SET status = 'REJECTED' WHERE id = ?", [rental_id]);
        }
        await loadCarsBuffer();
        res.json({ message: 'Success' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/my-rental-status', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401);
    const token = authHeader.split(" ")[1];
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [rows] = await pool.query(
            "SELECT status FROM rentals WHERE user_id = ? ORDER BY id DESC LIMIT 1", 
            [decoded.userId]
        );
        res.json(rows[0] || { status: 'NONE' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});


app.post('/api/rentals/return', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Unauthorized' });
    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const [activeRentals] = await pool.query(
            "SELECT * FROM rentals WHERE user_id = ? AND status = 'ACTIVE' LIMIT 1", 
            [decoded.userId]
        );

        if (activeRentals.length === 0) {
            return res.status(400).json({ message: 'Tidak ada peminjaman aktif.' });
        }

        const rental = activeRentals[0];

        await pool.query(
            "UPDATE rentals SET status = 'COMPLETED', end_time = NOW() WHERE id = ?", 
            [rental.id]
        );

        await pool.query(
            "UPDATE cars SET status = 'TERSEDIA' WHERE id = ?", 
            [rental.car_id]
        );

        const [carRows] = await pool.query("SELECT device_id FROM cars WHERE id = ?", [rental.car_id]);
        if (carRows.length > 0 && activeCars[carRows[0].device_id]) {
            const devId = carRows[0].device_id;
            activeCars[devId].networkStatus = 'Offline';
            activeCars[devId].connectedDevice = null;
            activeCars[devId].speed = 0;
            activeCars[devId].alert = 'SAFE';
            activeCars[devId].lat = null;
            activeCars[devId].lng = null;
        }
        
        await loadCarsBuffer();
        
        res.json({ message: 'Mobil berhasil dikembalikan.' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message });
    }
});

const udpServer = { bind: () => console.log("UDP Listener Disabled by User Request (Real-time Web GPS Only)") };

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (!err) socket.user = decoded;
            next();
        });
    } else next();
});

io.on('connection', async (socket) => {
    const user = socket.user;
    if (!user) return;
    
    console.log(`[WS] Connect: ${user.role} (${user.userId})`);

    let speedInterval = null;

    if (user.role === 'ADMIN') {
        socket.join('ADMIN_ROOM');
        socket.emit('update_all_cars', activeCars);
    } 
    else {
        try {
            console.log(`[WS] Checking active rental for User ${user.userId}...`);
            const [rows] = await pool.query(
                "SELECT r.id as rental_id, c.device_id FROM rentals r JOIN cars c ON r.car_id = c.id WHERE r.user_id = ? AND r.status = 'ACTIVE'", 
                [user.userId]
            );
            
            console.log(`[WS] Rental Query Result for User ${user.userId}:`, rows);

            if (rows.length > 0) {
                const carDeviceId = rows[0].device_id;
                const rentalId = rows[0].rental_id;
                console.log(`[WS] User ${user.userId} linked to Car ${carDeviceId} (Rental #${rentalId})`);
                
                socket.join(`CAR_${carDeviceId}`);
                
                if(activeCars[carDeviceId]) {
                    activeCars[carDeviceId].connectedDevice = user.device + ` [IP: ${socket.handshake.address.replace('::ffff:', '')}]`;
                    activeCars[carDeviceId].networkStatus = 'Online';
                    
                    io.to('ADMIN_ROOM').emit('update_all_cars', activeCars);
                    console.log(`[WS] ${carDeviceId} marked Online. Device: ${activeCars[carDeviceId].connectedDevice}`);
                    
                    if(speedInterval) clearInterval(speedInterval);
                    speedInterval = setInterval(() => {
                        if (activeCars[carDeviceId]) {
                            const currentSpeed = activeCars[carDeviceId].speed;
                            const logMsg = `[SPEED_LOG] ${carDeviceId} (User ${user.username}): ${currentSpeed} km/h`;
                            
                            io.to('ADMIN_ROOM').emit('speed_log_notification', {
                                carId: carDeviceId,
                                user: user.username,
                                speed: currentSpeed,
                                device: user.device,
                                time: new Date().toLocaleTimeString()
                            });
                        }
                    }, 3000);

                    socket.on('client_gps_update', async (gps) => {
                         if (activeCars[carDeviceId]) {
                            if (activeCars[carDeviceId].status !== 'DISEWA') {
                                return;
                            }

                            const now = Date.now();
                            let calculatedSpeed = 0;
                            const car = activeCars[carDeviceId];

                            // START: Manual Speed Calculation Logic
                            if (car.lat && car.lng && car.lastUpdateTimestamp) {
                                const timeDiff = (now - car.lastUpdateTimestamp) / 1000; // seconds
                                
                                // Only calculate if at least 1 second has passed to avoid division by zero or extreme spikes
                                if (timeDiff >= 1) {
                                    const R = 6371; // Radius of the earth in km
                                    const dLat = (gps.lat - car.lat) * (Math.PI / 180);
                                    const dLon = (gps.lng - car.lng) * (Math.PI / 180);
                                    const a = 
                                        Math.sin(dLat/2) * Math.sin(dLat/2) +
                                        Math.cos(car.lat * (Math.PI / 180)) * Math.cos(gps.lat * (Math.PI / 180)) * 
                                        Math.sin(dLon/2) * Math.sin(dLon/2);
                                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
                                    const distance = R * c; // Distance in km
                                    
                                    // Speed in km/h = Distance (km) / Time (hours)
                                    calculatedSpeed = distance / (timeDiff / 3600);
                                    
                                    // Filter Noise: If avg speed is unrealistically high (> 200 km/h) due to GPS jump, ignore or clamp?
                                    // Or if distance is very small (GPS drift), set to 0.
                                    if(distance < 0.002) calculatedSpeed = 0; // Less than 2 meters moved
                                } else {
                                    // If time diff is too small, assume previous speed or 0
                                    calculatedSpeed = car.speed || 0;
                                }
                            }
                            
                            const finalSpeed = Math.round(calculatedSpeed);
                            // END: Manual Speed Calculation Logic
                            
                            activeCars[carDeviceId] = {
                                ...activeCars[carDeviceId],
                                lat: gps.lat,
                                lng: gps.lng,
                                speed: finalSpeed,
                                lastSeen: new Date().toLocaleTimeString('id-ID'),
                                lastUpdateTimestamp: now,
                                networkStatus: 'Online (GPS)'
                            };

                            // LOG TO DATABASE
                            try {
                                await pool.query(
                                    "INSERT INTO trip_logs (rental_id, lat, lng, speed) VALUES (?, ?, ?, ?)",
                                    [rentalId, gps.lat, gps.lng, finalSpeed]
                                );
                            } catch (err) { console.error("Trip Log Error:", err.message); }

                            // SEND FULL CAR UPDATE BACK TO DRIVER (includes calculated speed & alerts)
                            socket.emit('update_my_car', activeCars[carDeviceId]);

                            io.to('ADMIN_ROOM').emit('update_all_cars', activeCars);
                         }
                    });
                } else {
                    console.error(`[WS] ERROR: Car ${carDeviceId} not found in activeCars memory! Keys:`, Object.keys(activeCars));
                }
            } else {
                console.log(`[WS] No ACTIVE rental found for User ${user.userId}`);
            }
        } catch (e) { console.error('WS Error:', e); }
    }

    socket.on('disconnect', () => {
        if (speedInterval) clearInterval(speedInterval);
        console.log(`[WS] Disconnect: ${user.username}`);
    });
});

app.get('/api/rentals/history', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT r.id, u.name as user_name, c.name as car_name, c.plate_number, r.status, r.created_at, r.end_time 
             FROM rentals r 
             JOIN users u ON r.user_id = u.id 
             JOIN cars c ON r.car_id = c.id 
             WHERE r.status = 'COMPLETED' 
             ORDER BY r.end_time DESC`
        );
        res.json(rows);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.get('/api/rentals/:id/logs', async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT lat, lng, speed, created_at FROM trip_logs WHERE rental_id = ? ORDER BY created_at ASC",
            [req.params.id]
        );
        res.json(rows);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

const HTTP_PORT = process.env.PORT_HTTP || 3000;
const HTTPS_PORT = process.env.PORT_HTTPS || 3443;
const UDP_PORT = process.env.PORT_UDP || 4000;

server.listen(HTTP_PORT, () => console.log(`🚀 HTTP Server running on port ${HTTP_PORT}`));
if (httpsServer) {
    httpsServer.listen(HTTPS_PORT, () => console.log(`🔒 HTTPS Server running on port ${HTTPS_PORT} (Use this for GPS!)`));
}
udpServer.bind(UDP_PORT);