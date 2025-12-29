const pool = require('./config/database');

async function check() {
    try {
        const [rows] = await pool.query("SELECT status FROM rentals WHERE user_id = 2 ORDER BY id DESC LIMIT 1");
        console.log("STATUS:", rows[0].status);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
