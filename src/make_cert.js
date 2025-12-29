const selfsigned = require('selfsigned');
const fs = require('fs');

async function run() {
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const options = { days: 365, keySize: 2048 }; // keySize helps speed

    console.log("Start generation...");
    
    // Check if it returns promise or object
    try {
        let pems = selfsigned.generate(attrs, options);
        if (pems && pems.cert) {
            fs.writeFileSync('cert.pem', pems.cert);
            fs.writeFileSync('key.pem', pems.private);
            console.log("SYNC SUCCESS: Saved cert.pem");
            return;
        } else if (pems instanceof Promise) {
            pems = await pems;
            fs.writeFileSync('cert.pem', pems.cert);
            fs.writeFileSync('key.pem', pems.private);
            console.log("PROMISE SUCCESS: Saved cert.pem");
            return;
        }
    } catch (e) {
        // failed sync, try callback
        console.log("Sync/Promise check failed, trying callback...", e.message);
    }

    selfsigned.generate(attrs, options, (err, pems) => {
        if(err) console.error("Callback Error:", err);
        else {
            fs.writeFileSync('cert.pem', pems.cert);
            fs.writeFileSync('key.pem', pems.private);
            console.log("CALLBACK SUCCESS: Saved cert.pem");
        }
    });
}

run();
