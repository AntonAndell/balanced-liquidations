import { Liquidations } from "./liquidations";

const fs = require('fs');

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const liquidations = new Liquidations(config, );

async function check() {
    try {
        await liquidations.check();
    } catch (error) {
        console.log(error)
    }
}

async function sync() {
    try {
        await liquidations.sync();
    } catch (error) {
        console.log(error)
    }
}

setInterval(sync, config.sync_interval*1000);
setInterval(check, config.check_interval*1000);