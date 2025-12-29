const io = require('socket.io-client');
const dgram = require('dgram');
const udpClient = dgram.createSocket('udp4');

async function start() {
    // 1. Login HTTP
    console.log("Logging in...");
    const response = await fetch('http://127.0.0.1:3000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'NodeJS Client Pro/1.0 (Android 14; Mobile)' },
        body: JSON.stringify({ username: 'peminjam_01', password: '123' })
    });
    
    // Check status
    if (!response.ok) {
        console.error("HTTP Error:", response.status, response.statusText);
        const text = await response.text();
        console.error("Body:", text);
        process.exit(1);
    }

    const loginData = await response.json();
    if (!loginData.token) {
        console.error("Login failed!", loginData);
        process.exit(1);
    }
    
    console.log("Logged in! Token:", loginData.token.substring(0, 20) + "...");
    
    // 2. Connect WebSocket
    const socket = io('http://127.0.0.1:3000', {
        auth: { token: loginData.token }
    });

    socket.on('connect', () => {
        console.log("WebSocket connected! ID:", socket.id);
    });

    socket.on('update_my_car', (car) => {
        console.log(`[WS] Update My Car: Speed ${car.speed} km/h, Alert: ${car.alert}, LastSeen: ${car.lastSeen}`);
    });

    // 3. Send UDP Data
    const carId = 'MOBIL_A';
    console.log("Starting UDP Stream...");
    
    setInterval(() => {
        const data = JSON.stringify({
            carId: carId,
            lat: -6.2 + (Math.random() * 0.005),
            lng: 106.8 + (Math.random() * 0.005),
            speed: Math.floor(Math.random() * 120),
            networkStatus: '4G - Strong' 
        });

        udpClient.send(data, 4000, 'localhost', (err) => {
            if (err) console.error(err);
        });
    }, 2000); // Every 2 seconds
}

start();
