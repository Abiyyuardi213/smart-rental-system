const pool = require('./config/database');

async function initDB() {
    try {
        const connection = await pool.getConnection();
        console.log("✅ Database Connected!");

        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('ADMIN', 'PEMINJAM') DEFAULT 'PEMINJAM',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log(" - Table 'users' ready.");

        await connection.query(`
            CREATE TABLE IF NOT EXISTS cars (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                plate_number VARCHAR(20) UNIQUE NOT NULL,
                device_id VARCHAR(50) UNIQUE NOT NULL, 
                status ENUM('TERSEDIA', 'DISEWA', 'PENDING', 'MAINTENANCE') DEFAULT 'TERSEDIA',
                image_url VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log(" - Table 'cars' ready.");

        await connection.query(`
            CREATE TABLE IF NOT EXISTS rentals (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                car_id INT,
                status ENUM('PENDING', 'ACTIVE', 'COMPLETED', 'REJECTED') DEFAULT 'PENDING',
                start_time TIMESTAMP NULL,
                end_time TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (car_id) REFERENCES cars(id)
            )
        `);
        console.log(" - Table 'rentals' ready.");

        const [users] = await connection.query("SELECT * FROM users WHERE username = 'admin_rental'");
        if (users.length === 0) {
            await connection.query("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ['admin_rental', '123', 'ADMIN']);
            console.log(" - Seed Admin User created.");
        }

         const [peminjam] = await connection.query("SELECT * FROM users WHERE username = 'peminjam_01'");
        if (peminjam.length === 0) {
            await connection.query("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ['peminjam_01', '123', 'PEMINJAM']);
            console.log(" - Seed Peminjam User created.");
        }

        const [cars] = await connection.query("SELECT * FROM cars");
        if (cars.length === 0) {
            await connection.query(`
                INSERT INTO cars (name, plate_number, device_id, status) VALUES 
                ('Toyota Avanza', 'B 1234 KYZ', 'MOBIL_A', 'TERSEDIA'),
                ('Honda Jazz', 'B 5678 ABC', 'MOBIL_B', 'TERSEDIA')
            `);
            console.log(" - Seed Cars created.");
        }

        connection.release();
        process.exit(0);
    } catch (error) {
        console.error("❌ Database Init Failed:", error);
        process.exit(1);
    }
}

initDB();
