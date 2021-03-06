# ArkStats Reporter

[arkstats-reporter](https://github.com/dafty-1/arkstats-reporter) is a backend service that runs alongside [ark-node](https://github.com/ArkEcosystem/ark-node) via JSON-RPC to fetch and send real-time statistics about the Ark network to the [ArkStats server](https://arkstats.net). For full installation instructions and to learn how it works, check out the [Wiki](https://github.com/dafty-1/arkstats-reporter/wiki).

# ArkStats Server
The arkstats-server is currently in development and will be released in a separate repository soon:

![ArkStats Server](https://github.com/dafty-1/arkstats-reporter/blob/master/ArkStatsReporter.png?raw=true)

# Dependencies
- git
- [ark-node](https://github.com/ArkEcosystem/ark-node)
- npm
- nodejs
- ntp

# Installation on Ubuntu Server
Ensure that [ark-node](https://github.com/ArkEcosystem/ark-node) is installed, running, and that the API (port 4001 by default) is open and reachable from your server. For instructions on setting up an Ark node, please [refer to this blog post](https://blog.ark.io/how-to-setup-a-node-for-ark-and-a-basic-cheat-sheet-4f82910719da).

Clone the arkstats-reporter release branch and run the [interactive build script](https://github.com/dafty-1/arkstats-reporter/blob/master/build.sh).

```sh
sudo apt-get install git
git clone -b release https://github.com/dafty-1/arkstats-reporter.git
cd arkstats-reporter/
bash build.sh
```

**Note: You must clone and install arkstats-reporter as a regular user. Do not run as the root user.**

Alternatively, you can edit the `RPC_HOST`, `RPC_PORT`, `LISTENING_PORT`, `INSTANCE_NAME`, `CONTACT_DETAILS` and `WS_SECRET` values directly in [app.json](https://github.com/dafty-1/arkstats-reporter/blob/master/app.json) if you do not want to use the installation script.

**Note: You must obtain the secret token in order to authenticate with ArkStats server. Please send [dafty](https://arkecosystem.slack.com/messages/@dafty/) a message, or ask around in the ArkEcosystem Slack to get your secret token.**

# Updating
Simply pull the latest revision and re-run the build script. You will be asked if you want to keep your existing configuration.
```sh
cd arkstats-reporter/
git pull
bash build.sh
```

# Installation on Docker
A Docker image containing an ark-node instance and arkstats-reporter will be available soon.

# Running the reporter
To start the reporter:
```sh
pm2 start app.json
```
To stop the reporter:
```sh
pm2 stop arkstats-reporter
```

To check if the reporter is running:
```sh
pm2 status
```

To check the logs:
```sh
pm2 logs arkstats-reporter
```
# License
Licensed under the [GPLv3 License](https://github.com/dafty-1/arkstats-reporter/blob/master/LICENSE).

# Links
- [ArkStats Server](https://arkstats.net)
- [Mainnet Block Explorer](https://explorer.dafty.net)
- [Devnet Block Explorer](https://dexplorer.dafty.net)
- [Ark Profit Sharing Pool](https://dafty.net)

# Credits
Thanks to [karek314](https://github.com/karek314/lisk-network-reporter) and [cubedro](https://github.com/cubedro/eth-net-intelligence-api) for the Lisk and Ethereum reporters in which this project was forked from.

Special thanks to [jamiec79](https://arkecosystem.slack.com/messages/@jamiec79/), [ghostfaceuk](https://arkecosystem.slack.com/messages/@ghostfaceuk/) and [sidzero](https://arkecosystem.slack.com/messages/@sidzero/) for testing the reporter.
