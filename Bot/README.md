# Liquidator

## Start service
``` bash
npm start
```

## Configuring service
Create a config.json with the following fields.

- **icon_url**: The URL for the ICON network API.
  - Example: `https://lisbon.net.solidwallet.io/api/v3`

- **icon_pk**: Wallet private key for the ICON network.
  - Example: `""`

- **loans**: The blockchain address for the Loans contract on the ICON network,
  - Example: `cx7380205103a9076aae26d1c761a8bb6652ecf30f`

- **oracle**: The blockchain address for the Balanced oracle contract on the ICON network,
  - Example: `cxeda795dcd69fe3d2e6c88a6473cdfe5532a3393e`

- **bnUSD**: The blockchain address for the bnSUD contract on the ICON network,
  - Example: `cx7380205103a9076aae26d1c761a8bb6652ecf30f`

- **auto_liquidator**: Optional: Address of a auto liquidator contract,
  - Example: `cx7380205103a9076aae26d1c761a8bb6652ecf30f`

- **nid**: Network ID for the ICON network, specifying the network environment (e.g., mainnet, testnet).
  - Example: `0x2`

- **sync_interval**: The time interval, in seconds, between a full update of all loans positions
  - Example: `300`
- **check_interval**: The time interval, in seconds, between checking if any position is below its liquidation threshold
  - Example: `30`

# How to setup a service using PM2
To for example setup a price monitor on a EC2 instance:

## Setup Polling service
``` bash
pm2 start ./node_modules/.bin/ts-node --name "price-monitor" -- src/servicePoll.ts
```

Configure service to start on startup
``` bash
pm2 save
pm2 startup
```
