const dgram = require('dgram');
const client = dgram.createSocket('udp4');

setInterval(() => {
    const data = JSON.stringify({
        carId: 'MOBIL_A',
        lat: -6.2 + (Math.random() * 0.01),
        lng: 106.8 + (Math.random() * 0.01),
        speed: Math.floor(Math.random() * 120)
    });

    client.send(data, 4000, 'localhost');
    console.log("Mobil A mengirim lokasi terbaru...");
}, 2000);