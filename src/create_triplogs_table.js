const pool = require('./config/database');

async function createTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS trip_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                rental_id INT NOT NULL,
                lat DECIMAL(10, 8) NOT NULL,
                lng DECIMAL(11, 8) NOT NULL,
                speed FLOAT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (rental_id)
            )
        `);
        console.log("✅ Table 'trip_logs' created/verified!");
        process.exit();
    } catch (e) {
        console.error("❌ Migration failed:", e.message);
        process.exit(1);
    }
}

createTable();
