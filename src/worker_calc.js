const { parentPort, workerData } = require('worker_threads');

// Fungsi simulasi Geofencing (Cek apakah mobil keluar batas)
function checkGeofence(lat, lng) {
    // Contoh batas sederhana (misal: Jakarta)
    const jakartaBounds = { latMin: -6.4, latMax: -6.0, lngMin: 106.6, lngMax: 107.0 };
    
    if (lat < jakartaBounds.latMin || lat > jakartaBounds.latMax || 
        lng < jakartaBounds.lngMin || lng > jakartaBounds.lngMax) {
        return "OUT_OF_BOUNDS";
    }
    return "SAFE";
}

const result = {
    carId: workerData.carId,
    areaStatus: checkGeofence(workerData.lat, workerData.lng),
    isOverSpeed: workerData.speed > 100,
    processedAt: new Date().toISOString()
};

parentPort.postMessage(result);